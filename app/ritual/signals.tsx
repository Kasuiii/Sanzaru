"use client";
import {useEffect,useState} from "react";
import {Send,Undo2,Trash2,LoaderCircle} from "lucide-react";
import {GESTURES,SILENT_INTENTS,type SilentSignal} from "@/lib/ritual-shared";
import type {RitualParty} from "../use-ritual-party";

export function SignalCard({signal}:{signal:SilentSignal}){
 if(signal.kind==="intent"){
  const intent=SILENT_INTENTS.find(i=>i.id===signal.intent)!;
  return <div className="silent-intent" aria-label={intent.label}><b>{intent.symbol}</b><span>{intent.label}</span></div>;
 }
 const gesture=GESTURES.find(g=>g.id===signal.gesture);
 return <div className="silent-card" aria-label={"ลำดับจุด "+signal.nodes.join(" → ")+" แล้ว "+gesture?.name}>
  <small>แผ่นสัญลักษณ์จากอิวาซารุ</small>
  <div className="signal-route">{signal.nodes.map((n,i)=><span key={i}>{i>0&&<i aria-hidden="true">→</i>}<b>{n}</b></span>)}</div>
  <div className="signal-seal"><b>{gesture?.symbol}</b><span>{gesture?.name}</span></div>
 </div>;
}

export function SignalComposer({party}:{party:RitualParty}){
 const [nodes,setNodes]=useState<number[]>([]),[gesture,setGesture]=useState(""),[pending,setPending]=useState<{seq:number;route:boolean}|null>(null);
 const self=party.room!.players.find(p=>p.id===party.room!.selfId)!;
 const disabled=!!pending||party.connection!=="online";
 useEffect(()=>{if(pending&&self.ack>=pending.seq){if(pending.route){setNodes([]);setGesture("");}setPending(null);}else if(pending&&party.error&&party.connection==="online")setPending(null);},[self.ack,pending,party.error,party.connection]);
 function send(signal:SilentSignal){if(disabled)return;const seq=party.send({type:"signal",to:"relay",signal});if(seq)setPending({seq,route:signal.kind==="route"});}
 return <div className="signal-composer">
  <div className="signal-title"><b>กระดานวาจาเงียบ</b><small>เลือกจุดตามตำรา แล้วเลือกท่าปิดผนึก</small></div>
  <div className="signal-node-grid" aria-label="เรียงลำดับจุดให้มิซารุ">{Array.from({length:9},(_,i)=>i+1).map(n=><button type="button" key={n} disabled={disabled||nodes.length>=9} onClick={()=>setNodes(v=>[...v,n])} aria-label={"เพิ่มจุด "+n}>{n}</button>)}</div>
  <div className="signal-draft"><output aria-live="polite">{nodes.length?nodes.join(" → "):"ยังไม่ได้เรียงจุด"}</output><button type="button" disabled={disabled||!nodes.length} aria-label="ลบจุดล่าสุด" onClick={()=>setNodes(v=>v.slice(0,-1))}><Undo2 size={16}/></button><button type="button" disabled={disabled||!nodes.length} aria-label="ล้างแผ่นสัญลักษณ์" onClick={()=>{setNodes([]);setGesture("");}}><Trash2 size={16}/></button></div>
  <div className="signal-gestures">{GESTURES.map(g=><button type="button" key={g.id} disabled={disabled} aria-pressed={gesture===g.id} onClick={()=>setGesture(g.id)} title={g.name}><span>{g.symbol}</span><small>{g.name}</small></button>)}</div>
  <button type="button" className="secondary-button signal-send" disabled={disabled||nodes.length<2||!gesture} onClick={()=>send({kind:"route",nodes,gesture})}>{pending?<LoaderCircle className="spin" size={16}/>:<Send size={16}/>}ส่งแผ่นสัญลักษณ์</button>
  <div className="signal-intents">{SILENT_INTENTS.map(i=><button type="button" key={i.id} disabled={disabled} onClick={()=>send({kind:"intent",intent:i.id})}><b>{i.symbol}</b><small>{i.label}</small></button>)}</div>
  <p className="signal-note">คำตอบเดินทางถึงมิซารุเท่านั้น เขาต้องตีความและเล่าต่อเอง</p>
 </div>;
}
