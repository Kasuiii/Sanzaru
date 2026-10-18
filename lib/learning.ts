import {DILEMMAS,EVIDENCE_CARDS,EVIDENCE_LABELS,LEARNING_GOALS,WORKSHOP_BLOCKS,type EvidenceKind} from "./learning-content";
import {ROLES,type RitualRole} from "./ritual-shared";

export const JOURNAL_KEY = "sanzaru-learning-v1";
export const JOURNAL_EVENT = "sanzaru-learning-updated";
export type RoundLearning = {
  id:string;at:string;role:RitualRole;round:number;outcome:"won"|"lost";
  stage:number;total:number;score:number;strikes:number;goal:string;
  before:number|null;after:number|null;moment:string;next:string;
};
export type LearningJournal = {
  version:1;goal:string;before:number|null;
  choices:Record<string,{choice:number;reason:string}>;
  evidence:Record<string,string>;rounds:RoundLearning[];
};
export function emptyJournal():LearningJournal {
  return{version:1,goal:"verify",before:null,choices:{},evidence:{},rounds:[]};
}
const rating=(v:unknown)=>Number.isInteger(v)&&Number(v)>=1&&Number(v)<=5?Number(v):null;
const text=(v:unknown,max=1200)=>typeof v==="string"?v.slice(0,max):"";
export function decodeJournal(raw:string|null):LearningJournal{
  const clean=emptyJournal();if(!raw)return clean;
  try{
    const x=JSON.parse(raw);if(!x||x.version!==1)return clean;
    if(LEARNING_GOALS.some(g=>g.id===x.goal))clean.goal=x.goal;
    clean.before=rating(x.before);
    for(const d of DILEMMAS){const c=x.choices?.[d.id];if(c&&Number.isInteger(c.choice)&&c.choice>=0&&c.choice<d.options.length)clean.choices[d.id]={choice:c.choice,reason:text(c.reason)};}
    for(const c of EVIDENCE_CARDS)if(["fact","inference","unknown"].includes(x.evidence?.[c.id]))clean.evidence[c.id]=x.evidence[c.id];
    if(Array.isArray(x.rounds))for(const r of x.rounds.slice(0,30)){
      if(!r||typeof r.id!=="string"||!["caster","scribe","relay"].includes(r.role)||!["won","lost"].includes(r.outcome)||typeof r.at!=="string")continue;
      if(![r.round,r.stage,r.total,r.score,r.strikes].every(v=>Number.isInteger(v)&&v>=0)||r.total<1||r.round<1||r.stage>r.total||!Number.isFinite(Date.parse(r.at)))continue;
      clean.rounds.push({id:text(r.id,100),at:text(r.at,40),role:r.role,round:r.round,outcome:r.outcome,stage:r.stage,total:r.total,score:r.score,strikes:r.strikes,goal:LEARNING_GOALS.some(g=>g.id===r.goal)?r.goal:"verify",before:rating(r.before),after:rating(r.after),moment:text(r.moment),next:text(r.next)});
    }
    return clean;
  }catch{return clean;}
}
export function putRound(journal:LearningJournal,round:RoundLearning):LearningJournal{
  return{...journal,rounds:[round,...journal.rounds.filter(r=>r.id!==round.id)].slice(0,30)};
}
export function journalMarkdown(j:LearningJournal):string{
  const lines=["# SANZARU — บันทึกการเรียนรู้","",
    "บันทึกส่วนบุคคลจากอุปกรณ์นี้ ไม่ใช่ผลวินิจฉัยหรือหลักฐานยืนยันประสิทธิผลทางการศึกษา",
    "ระดับ 1–5 เป็นการประเมินตนเองว่าตนพร้อมตรวจสอบความเข้าใจร่วมกันเพียงใด ไม่ใช่คะแนนความสามารถ",
    "","## เป้าหมาย",LEARNING_GOALS.find(g=>g.id===j.goal)?.title||j.goal,
    "ประเมินตนเองก่อนเล่น: "+(j.before===null?"ยังไม่ตอบ":j.before+"/5"),"","## สถานการณ์ชวนคิด"];
  for(const d of DILEMMAS){const c=j.choices[d.id];if(c)lines.push("",d.title,"ทางเลือก: "+d.options[c.choice].title,"เหตุผลของฉัน: "+(c.reason||"ยังไม่ได้เขียน"));}
  lines.push("","## กิจกรรมแยกหลักฐาน");
  for(const e of EVIDENCE_CARDS)lines.push(e.statement+" — "+(EVIDENCE_LABELS[j.evidence[e.id] as EvidenceKind]||"ยังไม่ตอบ"));
  lines.push("","## บันทึกหลังเล่น");
  if(!j.rounds.length)lines.push("ยังไม่มีบันทึกหลังเล่น");
  for(const r of j.rounds)lines.push("",
    "### รอบ "+r.round+" · "+(ROLES.find(x=>x.id===r.role)?.title||r.role)+" · "+r.at,
    "เป้าหมายรอบนี้: "+(LEARNING_GOALS.find(g=>g.id===r.goal)?.title||r.goal),
    "ผลเกม: "+(r.outcome==="won"?"ผนึกสำเร็จ":"ยังไม่สำเร็จ")+" | ผนึก "+r.stage+"/"+r.total+" | คะแนน "+r.score+" | พลาด "+r.strikes+" ครั้ง",
    "ก่อน: "+(r.before??"ไม่ได้ตอบ")+" / หลัง: "+(r.after??"ไม่ได้ตอบ")+" (ประเมินตนเอง 1–5)",
    "เหตุการณ์ที่สังเกต: "+r.moment,"สิ่งที่จะลองครั้งหน้า: "+r.next);
  return lines.join("\n");
}
export function workshopMarkdown(minutes:number,groups:number):string{
  const blocks=WORKSHOP_BLOCKS[minutes]||WORKSHOP_BLOCKS[30];
  const safeGroups=Math.max(1,Math.min(30,Math.trunc(Number.isFinite(groups)?groups:1)));
  return ["# SANZARU — แผนกิจกรรม "+blocks.reduce((n,b)=>n+b.minutes,0)+" นาที","",
    "จำนวนทีม: "+safeGroups+" | ผู้เล่น: "+safeGroups*3+" คน | 3 อุปกรณ์ต่อทีม",
    "กล้องใช้เฉพาะผู้ร่ายในแต่ละรอบ หมุนบทบาทแล้วตรวจความพร้อมของกล้องอีกครั้ง",
    "เป้าหมาย: แยกหลักฐานกับการตีความ ทวนความเข้าใจ และรับผิดชอบต่อสารที่ส่งต่อ","",
    ...blocks.map((b,i)=>(i+1)+". "+b.title+" ("+b.minutes+" นาที)\n   "+b.detail),
    "","## คำถามถอดบทเรียน","- ช่วงไหนที่เราคิดว่ารู้ แต่จริง ๆ กำลังเดา?",
    "- ผู้รับเข้าใจต่างจากผู้ส่งตรงไหน เรารู้ได้อย่างไร?",
    "- รอบหน้าเราจะใช้ประโยคหรือสัญญาณอะไรเพื่อยืนยันกัน?",
    "","## การสังเกตของผู้จัด",
    "บันทึกตัวอย่างการถามเพิ่ม การทวนสาร และการแก้ข้อมูล ไม่ใช้คะแนนชนะเกมแทนความเข้าใจปรัชญา",
    "ให้ผู้เล่นเลือกแชร์บันทึกที่ดาวน์โหลดด้วยตนเอง เว็บไม่ส่งบันทึกส่วนตัวให้อาจารย์อัตโนมัติ",
    "การเปรียบเทียบก่อน–หลังเป็นข้อมูลเบื้องต้น ยังแยกผลการฝึกซ้ำหรือความคุ้นเคยกับเกมไม่ได้",
    "","## ก่อนเริ่ม","เตรียม HTTPS, ทดสอบกล้อง/ไมค์, เข้าห้องเซิร์ฟเวอร์เดียวกัน และตรวจว่ามีผู้เล่นครบสามบทบาท",
    "หลังเริ่มรอบใหม่ ให้เจ้าของห้องกดเปลี่ยนมุมมอง ทุกคนกดพร้อม แล้วเริ่มรอบถัดไป",
  ].join("\n");
}
