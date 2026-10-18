"use client";
import {useEffect,useRef,useState} from "react";
import {Send,Mic,Square,Play,LoaderCircle,Volume2,Trash2,Radio} from "lucide-react";
import {toast} from "sonner";
import {ROLES,canSendVoice,canHear,type RitualRole} from "@/lib/ritual-shared";
import type {RitualParty} from "../use-ritual-party";
import type {RitualMessage} from "@/lib/ritual-engine";
import {SignalCard,SignalComposer} from "./signals";
function VoiceClip({message,party}:{message:RitualMessage;party:RitualParty}){
 const [url,setUrl]=useState(""),[loading,setLoading]=useState(false),source=useRef("");
 useEffect(()=>()=>{if(source.current)URL.revokeObjectURL(source.current);},[]);
 return url?<audio controls src={url} preload="metadata" aria-label={"ข้อความเสียงจาก "+message.name}/>:<button className="voice-play" disabled={loading} onClick={async()=>{setLoading(true);try{const blob=await party.loadVoice(message.voice!.id);source.current=URL.createObjectURL(blob);setUrl(source.current);}catch(e){toast.error((e as Error).message);}finally{setLoading(false);}}}>{loading?<LoaderCircle className="spin" size={16}/>:<Play size={16}/>}ฟังข้อความเสียง</button>;
}
export function RitualChat({party,to}:{party:RitualParty;to:RitualRole}){
 const r=party.room!,self=r.players.find(p=>p.id===r.selfId)!,role=ROLES.find(x=>x.id===to)!;
 const voiceAllowed=canSendVoice(self.role,to),hearing=canHear(self.role);
 const [draft,setDraft]=useState(""),[pending,setPending]=useState<{seq:number;text:string}|null>(null),[recording,setRecording]=useState(false),[starting,setStarting]=useState(false),[seconds,setSeconds]=useState(0),[voice,setVoice]=useState<{blob:Blob;id:string;url:string}|null>(null),[sending,setSending]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null),media=useRef<MediaStream|null>(null),messagesRef=useRef<HTMLDivElement>(null),startingRef=useRef(false),voiceRef=useRef(voice),alive=useRef(true);voiceRef.current=voice;
 const messages=r.messages.filter(m=>m.fromRole===to&&m.to===self.role||m.from===self.id&&m.to===to);
 useEffect(()=>{const box=messagesRef.current;if(box)box.scrollTo({top:box.scrollHeight,behavior:"smooth"});},[messages.length,messages.at(-1)?.id]);
 useEffect(()=>{if(pending&&self.ack>=pending.seq){setDraft(v=>v===pending.text?"":v);setPending(null);}else if(pending&&party.error)setPending(null);},[self.ack,pending,party.error]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;recorder.current?.state==="recording"&&recorder.current.stop();media.current?.getTracks().forEach(t=>t.stop());if(voiceRef.current)URL.revokeObjectURL(voiceRef.current.url);};},[]);
 useEffect(()=>{if(!recording)return;const start=Date.now(),timer=setInterval(()=>{const elapsed=(Date.now()-start)/1000;setSeconds(Math.floor(elapsed));if(elapsed>=10&&recorder.current?.state==="recording")recorder.current.stop();},200);return()=>clearInterval(timer);},[recording]);
 async function record(){
  if(!voiceAllowed)return;
  if(recording){recorder.current?.stop();return;}
  if(startingRef.current)return;startingRef.current=true;setStarting(true);
  try{if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined")throw new Error("เบราว์เซอร์นี้อัดเสียงไม่ได้ ใช้แชตแทนได้เลย");
   const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});if(!alive.current){stream.getTracks().forEach(t=>t.stop());return;}media.current=stream;
   const mime=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus"].find(x=>MediaRecorder.isTypeSupported(x));if(!mime){stream.getTracks().forEach(t=>t.stop());throw new Error("รูปแบบเสียงไม่รองรับ ใช้แชตแทนได้เลย");}
   const rec=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:24000}),chunks:BlobPart[]=[];recorder.current=rec;rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(!alive.current)return;setRecording(false);const blob=new Blob(chunks,{type:rec.mimeType});if(blob.size<100){toast("เสียงสั้นไป ลองอัดอีกครั้ง");return;}if(blob.size>256000){toast.error("ไฟล์เสียงใหญ่เกินไป ลองพูดให้สั้นลง");return;}setVoice({blob,id:crypto.randomUUID(),url:URL.createObjectURL(blob)});};rec.start();setSeconds(0);setRecording(true);
  }catch(e){media.current?.getTracks().forEach(t=>t.stop());toast.error((e as Error).name==="NotAllowedError"?"อนุญาตไมค์เพื่ออัดเสียง หรือพิมพ์แชตแทน":(e as Error).message);}finally{startingRef.current=false;if(alive.current)setStarting(false);}
 }
 function discard(){if(voice)URL.revokeObjectURL(voice.url);setVoice(null);}
 return <section className="ritual-chat" aria-label={"ช่องคุยกับ"+role.title} style={{"--channel":role.color} as React.CSSProperties}>
  <div className="chat-heading"><span><Radio size={18}/>{role.title}</span><small>{self.role==="relay"?"ช่องส่วนตัว · อีกฝั่งไม่เห็น":"ส่งถึงมิซารุเท่านั้น"}</small></div>
  <div ref={messagesRef} className="chat-messages" role="log" aria-label={"ข้อความกับ"+role.title} aria-live="polite">{!messages.length&&<div className="chat-empty"><Volume2 size={25}/><b>{self.role==="caster"?"บอกตราที่เห็นให้มิซารุ":self.role==="scribe"?"รอคำใบ้จากมิซารุ":to==="caster"?"ถามว่าคิคาซารุเห็นตราอะไร":"ส่งคำใบ้ให้อิวาซารุ แล้วรอแผ่นสัญลักษณ์"}</b><span>{self.role==="scribe"?"ตอบด้วยสัญลักษณ์ · รับข้อความและเสียงได้":to==="caster"?"คิคาซารุฟังเสียงไม่ได้ ส่งเป็นข้อความ":self.role==="caster"?"รับคำตอบเป็นข้อความ · ส่งเสียงให้มิซารุได้":"ข้อความหรือเสียงสั้นไม่เกิน 10 วินาที"}</span></div>}{messages.map(m=><div key={m.id} className={"chat-bubble "+(m.from===self.id?"mine":"")}><span>{m.from===self.id?"คุณ":m.name}</span>{m.signal?<SignalCard signal={m.signal}/>:m.voice?(hearing?<VoiceClip message={m} party={party}/>:<p>คิคาซารุไม่รับเสียง</p>):<p>{m.text}</p>}</div>)}</div>
  {voice&&voiceAllowed&&<div className="voice-draft">{hearing?<audio controls src={voice.url} aria-label="ฟังเสียงก่อนส่ง"/>:<span className="voice-muted-preview">บันทึกแล้ว · ส่งให้มิซารุฟังได้<br/>คิคาซารุไม่ฟังเสียงย้อนกลับ</span>}<div><button aria-label="ลบเสียงร่าง" disabled={sending} onClick={discard}><Trash2 size={16}/></button><button disabled={sending||party.connection!=="online"} onClick={async()=>{setSending(true);try{await party.uploadVoice(voice.blob,to,voice.id);discard();}catch(e){toast.error((e as Error).message);}finally{setSending(false);}}}>{sending?<LoaderCircle className="spin" size={16}/>:<Send size={16}/>}ส่งเสียง</button></div></div>}
  {self.role==="scribe"?<SignalComposer party={party}/>:<><form className="chat-compose" onSubmit={e=>{e.preventDefault();if(!draft.trim()||pending)return;const seq=party.send({type:"chat",to,text:draft.trim()});if(seq)setPending({seq,text:draft});}}><label className="sr-only" htmlFor={"chat-"+to}>ข้อความถึง{role.title}</label><input id={"chat-"+to} value={draft} onChange={e=>setDraft(e.target.value)} maxLength={280} placeholder={self.role==="relay"?"ฟังแล้วเล่าต่อให้ฝั่งนี้…":"บอกมิซารุว่า…"}/>{voiceAllowed&&<button type="button" className={recording?"recording":""} disabled={!!voice||sending||starting} aria-label={recording?"หยุดอัดเสียง":"อัดเสียงถึง"+role.title} onClick={record}>{starting?<LoaderCircle className="spin" size={17}/>:recording?<Square size={17}/>:<Mic size={18}/>}</button>}<button type="submit" aria-label={"ส่งข้อความถึง"+role.title} disabled={!draft.trim()||!!pending||party.connection!=="online"}>{pending?<LoaderCircle className="spin" size={17}/>:<Send size={18}/>}</button></form>
  <div className="chat-footnote">{recording?<span className="recording-label">กำลังอัด {seconds}/10 วินาที · กดสี่เหลี่ยมเพื่อหยุด</span>:<span>{draft.length}/280 · {voiceAllowed?"เสียงส่งเมื่อกดส่งเสียง":"ช่องนี้รับส่งตัวอักษร"}</span>}</div></>}
 </section>;
}
