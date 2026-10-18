"use client";
import {useEffect,useState} from "react";
import {Check,Download,BookOpen} from "lucide-react";
import {LEARNING_GOALS,LEARNING_ROLES} from "@/lib/learning-content";
import {journalMarkdown,putRound,type RoundLearning} from "@/lib/learning";
import type {RitualView} from "@/lib/ritual-engine";
import type {RitualRole} from "@/lib/ritual-shared";
import {useJournal,downloadText} from "./use-journal";

export function SelfRating({value,onChange,label,disabled=false}:{value:number|null;onChange:(n:number|null)=>void;label:string;disabled?:boolean}){
 return <fieldset className="ac-rating" disabled={disabled}><legend>{label}</legend><div>{[1,2,3,4,5].map(n=><button type="button" key={n} aria-pressed={value===n} aria-label={n+" จาก 5"} onClick={()=>onChange(value===n?null:n)}>{n}</button>)}</div><p>1 ยังไม่พร้อม · 3 พอพร้อม · 5 พร้อมมาก <span>เลือกซ้ำเพื่อล้างคำตอบ</span></p></fieldset>;
}
export function LearningBrief(){
 const {journal,ready,error,update}=useJournal();
 return <details className="ac-game-brief"><summary><BookOpen size={18}/><span>ก่อนเข้าพิธี: วันนี้อยากฝึกอะไร?</span><small>เลือกได้ · ไม่บังคับ</small></summary><div className="ac-brief-body"><p>เลือกหนึ่งข้อตกลงไว้ลองกับทีม หลังเกมค่อยกลับมาดูว่าเกิดอะไรขึ้น</p><div className="ac-goals" role="group" aria-label="เป้าหมายการเรียนรู้">{LEARNING_GOALS.map(g=><button key={g.id} disabled={!ready} aria-pressed={journal.goal===g.id} onClick={()=>update(j=>({...j,goal:g.id}))}><strong>{g.title}</strong><span>{g.detail}</span></button>)}</div><SelfRating value={journal.before} disabled={!ready} onChange={before=>update(j=>({...j,before}))} label="ก่อนเล่น ฉันพร้อมตรวจสอบความเข้าใจร่วมกันแค่ไหน?"/><p className="ac-note">คำตอบอยู่ในเบราว์เซอร์นี้เท่านั้น เป็นการประเมินตนเอง ไม่ใช่คะแนนความสามารถ</p>{error&&<p className="ac-error" role="alert">{error}</p>}</div></details>;
}
export function RoundDebrief({room,role}:{room:RitualView;role:RitualRole}){
 const {journal,ready,error,update}=useJournal(),id=room.code+"-"+room.expiresAt+"-"+room.round+"-"+room.selfId;
 const [moment,setMoment]=useState(""),[next,setNext]=useState(""),[after,setAfter]=useState<number|null>(null),[initialized,setInitialized]=useState(""),[saved,setSaved]=useState(false);
 useEffect(()=>{if(!ready||initialized===id)return;const old=journal.rounds.find(r=>r.id===id);setMoment(old?.moment||"");setNext(old?.next||"");setAfter(old?.after??null);setSaved(!!old);setInitialized(id);},[id,ready,initialized,journal.rounds]);
 const snapshot=():RoundLearning=>({id,at:new Date().toISOString(),role,round:room.round,outcome:room.phase==="won"?"won":"lost",stage:room.stage,total:room.total,score:room.score,strikes:room.strikes,goal:journal.goal,before:journal.before,after,moment:moment.trim(),next:next.trim()});
 const save=()=>setSaved(update(j=>putRound(j,snapshot())));
 return <section className="ac-round-debrief"><div className="ac-debrief-heading"><BookOpen size={18}/><h3>บอสจบแล้ว บทสนทนายังไปต่อ</h3></div><p>{LEARNING_ROLES[role].prompt}</p><label htmlFor="debrief-moment">หนึ่งเหตุการณ์ที่เราเดา หรือเข้าใจไม่ตรงกัน</label><textarea id="debrief-moment" rows={2} maxLength={1200} disabled={!ready} value={moment} onChange={e=>{setMoment(e.target.value);setSaved(false);}} placeholder="เช่น เราส่งเลขจุดครบ แต่ลืมยืนยันว่าเริ่มจากจุดไหน"/><label htmlFor="debrief-next">รอบหน้าเราจะลองเปลี่ยนอะไร?</label><textarea id="debrief-next" rows={2} maxLength={1200} disabled={!ready} value={next} onChange={e=>{setNext(e.target.value);setSaved(false);}} placeholder="เช่น ให้คนรับทวนจุดแรกและจุดสุดท้ายก่อนเริ่มลาก"/><SelfRating value={after} disabled={!ready} onChange={n=>{setAfter(n);setSaved(false);}} label="หลังเล่น ฉันพร้อมตรวจสอบความเข้าใจร่วมกันแค่ไหน?"/><div className="ac-actions"><button type="button" className="ac-button ac-small" disabled={!ready||(!moment.trim()&&!next.trim()&&after===null)} onClick={save}>{saved?<Check size={15}/>:<BookOpen size={15}/>} {saved?"เก็บในเครื่องแล้ว":"บันทึกไว้ลองรอบหน้า"}</button><button type="button" className="ac-text-link" disabled={!ready} onClick={()=>downloadText("sanzaru-reflection.md",journalMarkdown(putRound(journal,snapshot())))}><Download size={15}/>ดาวน์โหลด</button></div><p className="ac-note">ตอบได้ตามสมัครใจ · เก็บไว้ในเบราว์เซอร์นี้ ไม่ส่งให้ทีม/ผู้สอน · ให้ทุกคนบันทึกก่อนเจ้าของห้องเริ่มรอบใหม่</p>{error&&<p className="ac-error" role="alert">{error}</p>}<span className="ac-sr-only" role="status">{saved?"บันทึกสำเร็จแล้ว":""}</span></section>;
}
