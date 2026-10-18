/** Pure protocol, timing and geometry helpers. No network or browser globals. */
export const SEAL_IDS = ["Closed_Fist","Open_Palm","Victory","Thumb_Up"] as const;
export type SealId = typeof SEAL_IDS[number];
export type GestureId = SealId|"Pointing_Up"|"None";
export type HandBox = {x1:number;y1:number;x2:number;y2:number};
export const CUSTOM_FRAME_INTERVAL_MS = 200;
export const CUSTOM_MAX_AGE_MS = 650; // Below the game's 850 ms hold; a single frozen result cannot cast.
export type CustomHealth = {task:"detect"|"classify";classes:string[];inputMode:"full-frame"|"hand-crop";confidence:number};
export type CustomPrediction = {gesture:SealId|"None";confidence:number;className:string|null;inferenceMs:number};
const record=(x:unknown):Record<string,unknown>=>x&&typeof x==="object"&&!Array.isArray(x)?x as Record<string,unknown>:{};
export function normalizeApiUrl(value:string,pageProtocol="http:"):string{
 const url=new URL(value.trim());
 if(!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error("ใช้ URL http/https ของ API โดยไม่มีรหัสผ่าน query หรือ #");
 if(pageProtocol==="https:"&&url.protocol!=="https:")throw new Error("เว็บนี้ใช้ HTTPS กรุณาใช้ URL ของ AI API แบบ HTTPS ด้วย");
 return url.href.replace(/\/+$/,"");
}
export function readHealth(value:unknown):CustomHealth{
 const x=record(value);
 if(x.protocol!==1)throw new Error("API ไม่ใช่ SANZARU protocol 1 ตรวจว่า URL ชี้ไปยัง ai-server");
 if(x.ready!==true){const missing=Array.isArray(x.missing_gestures)?x.missing_gestures.filter(s=>typeof s==="string").join(", "):"";throw new Error(missing?"โมเดลยังขาดคลาสสำหรับ: "+missing:typeof x.error==="string"?x.error:"โมเดลยังไม่พร้อม");}
 if(!["detect","classify"].includes(String(x.task))||!["full-frame","hand-crop"].includes(String(x.input_mode))||!Array.isArray(x.classes)||x.classes.some(n=>typeof n!=="string")||!Array.isArray(x.mapped_gestures)||!SEAL_IDS.every(id=>(x.mapped_gestures as unknown[]).includes(id))||typeof x.confidence!=="number"||!Number.isFinite(x.confidence)||x.confidence<.6||x.confidence>1)throw new Error("ข้อมูลโมเดลจาก API ไม่ครบหรือไม่ตรงรูปแบบที่เกมรองรับ");
 return{task:x.task as CustomHealth["task"],classes:x.classes as string[],inputMode:x.input_mode as CustomHealth["inputMode"],confidence:x.confidence};
}
export function readPrediction(value:unknown):CustomPrediction{
 const x=record(value);
 if(x.protocol!==1||typeof x.gesture!=="string"||![...SEAL_IDS,"None"].includes(x.gesture)||typeof x.confidence!=="number"||!Number.isFinite(x.confidence)||x.confidence<0||x.confidence>1||typeof x.inference_ms!=="number"||!Number.isFinite(x.inference_ms)||x.inference_ms<0)throw new Error("ผลทำนายจาก API ไม่ถูกต้อง");
 return{gesture:x.gesture as CustomPrediction["gesture"],confidence:x.gesture==="None"?0:x.confidence,className:typeof x.class_name==="string"?x.class_name.slice(0,100):null,inferenceMs:x.inference_ms};
}
export function handBounds(points:{x:number;y:number}[]):HandBox|null{
 if(points.length<9||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys),padX=Math.max(.025,(hiX-loX)*.25),padY=Math.max(.025,(hiY-loY)*.25);
 const box={x1:Math.max(0,loX-padX),y1:Math.max(0,loY-padY),x2:Math.min(1,hiX+padX),y2:Math.min(1,hiY+padY)};
 return box.x2-box.x1>.01&&box.y2-box.y1>.01?box:null;
}
/** Never pairs a previous label with a new label's confidence. */
export class GestureFilter{
 private candidate:GestureId="None";private since=0;private last=-Infinity;
 private previous:{gesture:GestureId;confidence:number}={gesture:"None",confidence:0};
 constructor(private threshold=.6,private settleMs=180,private maxGapMs=500,private keepPreviousDuringTransition=false){}
 reset(){this.candidate="None";this.since=0;this.last=-Infinity;this.previous={gesture:"None",confidence:0};}
 observe(label:string,confidence:number,at:number):{gesture:GestureId;confidence:number}{
  const valid=[...SEAL_IDS,"Pointing_Up"].includes(label)&&Number.isFinite(confidence)&&confidence>=this.threshold&&confidence<=1;
  const next:GestureId=valid?label as GestureId:"None";
  if(!Number.isFinite(at)||at<=this.last)return{gesture:"None",confidence:0};
  if(at-this.last>this.maxGapMs)this.previous={gesture:"None",confidence:0};
  if(next!==this.candidate||at-this.last>this.maxGapMs){this.candidate=next;this.since=at;}
  this.last=at;
  if(at-this.since>=this.settleMs)this.previous=next!=="None"?{gesture:next,confidence}:{gesture:"None",confidence:0};
  return this.keepPreviousDuringTransition?this.previous:next!=="None"&&at-this.since>=this.settleMs?{gesture:next,confidence}:{gesture:"None",confidence:0};
 }
}
export function freshCustom(sample:{gesture:GestureId;confidence:number;capturedAt:number},now:number){
 return now>=sample.capturedAt&&now-sample.capturedAt<=CUSTOM_MAX_AGE_MS?{gesture:sample.gesture,confidence:sample.confidence}:{gesture:"None" as GestureId,confidence:0};
}
