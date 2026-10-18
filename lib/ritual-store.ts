import {env} from "cloudflare:workers";
import {RitualError,advanceRitual,applyRitualAction,ritualPlayer,ritualRoom,ritualView,validateRitualActions,addRitualMessage,type RitualState,type RitualPlayer} from "./ritual-engine";
import {canSendVoice,canHear,type RitualRole} from "./ritual-shared";
type Row={code:string;state:string;revision:number;expires_at:number};
const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",roles:RitualRole[]=["caster","scribe","relay"];
function database(){if(!env.DB)throw new Error("Ritual database unavailable");return env.DB;}
function bucket(){if(!env.BUCKET)throw new Error("Voice storage unavailable");return env.BUCKET;}
async function keyOf(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new RitualError("สิทธิ์เข้าห้องไม่ถูกต้อง",401);const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(h),v=>v.toString(16).padStart(2,"0")).join("");}
function codeOf(input:unknown){const code=typeof input==="string"?input.trim().toUpperCase():"";if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))throw new RitualError("รหัสห้องต้องมี 6 ตัว");return code;}
function nameOf(input:unknown){const name=typeof input==="string"?input.trim():"";if(!name||name.length>20)throw new RitualError("ใส่ชื่อ 1–20 ตัวอักษร");return name;}
async function read(code:string,key:string){const row=await database().prepare("SELECT code,state,revision,expires_at FROM ritual_rooms WHERE code=?").bind(code).first<Row>();if(!row||row.expires_at<=Date.now())throw new RitualError("ไม่พบห้องนี้ หรือห้องหมดอายุแล้ว",404);const state=JSON.parse(row.state) as RitualState;return{row,state,player:state.players.find(p=>p.key===key)};}
async function mutate(code:string,key:string,fn:(s:RitualState,p:RitualPlayer|undefined,now:number)=>string){
 for(let retry=0;retry<8;retry++){const {row,state}=await read(code,key),now=Date.now(),id=fn(state,state.players.find(p=>p.key===key),now);const result=await database().prepare("UPDATE ritual_rooms SET state=?,revision=revision+1 WHERE code=? AND revision=?").bind(JSON.stringify(state),code,row.revision).run();if(result.meta.changes===1)return ritualView(state,id,row.revision+1,now);}
 throw new RitualError("ห้องกำลังซิงก์ ลองใหม่สักครู่",503);
}
export async function ritualRequest(body:Record<string,unknown>,token:string){
 const key=await keyOf(token),db=database(),now=Date.now();
 if(body.op==="create"){
  const name=nameOf(body.name),role=roles.includes(body.role as RitualRole)?body.role as RitualRole:"caster";
  const old=await db.prepare("SELECT code,state,revision,expires_at FROM ritual_rooms WHERE owner_key=?").bind(key).first<Row>();if(old&&old.expires_at>now){const s=JSON.parse(old.state) as RitualState;return ritualView(s,s.hostId,old.revision,now);}
  const expired=await db.prepare("SELECT code,state,revision,expires_at FROM ritual_rooms WHERE expires_at<=? LIMIT 10").bind(now).all<Row>();
  for(const row of expired.results||[]){if(env.BUCKET){const objects=await env.BUCKET.list({prefix:"ritual/"+row.code+"/",limit:1000});if(objects.objects.length)await env.BUCKET.delete(objects.objects.map(o=>o.key));}await db.prepare("DELETE FROM ritual_rooms WHERE code=? AND expires_at<=?").bind(row.code,now).run();}
  for(let retry=0;retry<5;retry++){const code=Array.from(crypto.getRandomValues(new Uint8Array(6)),v=>alphabet[v%32]).join(""),p=ritualPlayer(crypto.randomUUID(),key,name,role,now),s=ritualRoom(code,p,now);const result=await db.prepare("INSERT OR IGNORE INTO ritual_rooms(code,owner_key,state,revision,expires_at) VALUES(?,?,?,0,?)").bind(code,key,JSON.stringify(s),s.expiresAt).run();if(result.meta.changes===1)return ritualView(s,p.id,0,now);}
  throw new RitualError("สร้างห้องไม่สำเร็จ ลองใหม่",503);
 }
 if(body.op!=="join"&&body.op!=="sync")throw new RitualError("คำขอไม่ถูกต้อง");const code=codeOf(body.code),actions=validateRitualActions(body.actions);
 return mutate(code,key,(s,p,at)=>{
  if(!p&&body.op==="join"){if(s.phase!=="lobby")throw new RitualError("รอจบรอบก่อนเข้าร่วม",409);if(s.players.length>=3)throw new RitualError("ห้องเต็มแล้ว รับได้ 3 คน",409);const name=nameOf(body.name),wanted=body.role as RitualRole,role=roles.includes(wanted)&&!s.players.some(x=>x.role===wanted)?wanted:roles.find(r=>!s.players.some(x=>x.role===r))!;p=ritualPlayer(crypto.randomUUID(),key,name,role,at);s.players.push(p);s.players.forEach(x=>x.ready=false);}
  if(!p)throw new RitualError("คุณไม่ได้อยู่ในห้องนี้",401);
  if(s.phase!=="closed"){advanceRitual(s,at);p.lastSeen=at;for(const action of actions)applyRitualAction(s,p.id,action,at);advanceRitual(s,at);}return p.id;
 });
}
const audioTypes=["audio/webm","audio/ogg","audio/mp4"];
export async function storeRitualVoice(token:string,codeInput:unknown,toInput:unknown,id:string,audio:Blob){
 const key=await keyOf(token),code=codeOf(codeInput),to=toInput as RitualRole,mime=audio.type.split(";")[0];
 if(!/^[a-f0-9-]{36}$/.test(id)||!roles.includes(to)||!audioTypes.includes(mime)||audio.size>256000||audio.size<100)throw new RitualError("ข้อความเสียงไม่ถูกต้องหรือยาวเกินไป");
 const first=await read(code,key);if(!first.player)throw new RitualError("คุณไม่ได้อยู่ในห้อง",401);
 if(first.state.phase==="closed")throw new RitualError("ห้องปิดแล้ว",409);
 if(!canSendVoice(first.player.role,to))throw new RitualError("พันธสัญญานี้ไม่อนุญาตให้ส่งเสียงในช่องนี้",403);
 const previous=first.state.messages.find(m=>m.voice?.id===id);if(previous){if(previous.from!==first.player.id)throw new RitualError("ไม่ใช่ข้อความของคุณ",403);return ritualView(first.state,first.player.id,first.row.revision,Date.now());}
 if(first.player.role==="relay"?to==="relay":to!=="relay")throw new RitualError("ต้องส่งเสียงผ่านคนกลาง",403);
 const objectKey="ritual/"+code+"/"+id;await bucket().put(objectKey,await audio.arrayBuffer(),{httpMetadata:{contentType:mime}});
 try{return await mutate(code,key,(s,p,now)=>{if(!p)throw new RitualError("คุณไม่ได้อยู่ในห้อง",401);if(!s.messages.some(m=>m.voice?.id===id)){advanceRitual(s,now);p.lastSeen=now;addRitualMessage(s,p,to,"ข้อความเสียง",now,{id,mime});}return p.id;});}
 catch(e){await bucket().delete(objectKey);throw e;}
}
export async function readRitualVoice(token:string,codeInput:unknown,id:string){
 const key=await keyOf(token),code=codeOf(codeInput);if(!/^[a-f0-9-]{36}$/.test(id))throw new RitualError("ไม่พบเสียง",404);const {state,player,row}=await read(code,key);if(!player||!canHear(player.role))throw new RitualError("บทบาทนี้ไม่มีสิทธิ์ฟังข้อความเสียง",403);const view=ritualView(state,player.id,row.revision,Date.now());if(!view.messages.some(m=>m.voice?.id===id))throw new RitualError("ไม่มีสิทธิ์ฟังข้อความนี้",403);const object=await bucket().get("ritual/"+code+"/"+id);if(!object)throw new RitualError("ข้อความเสียงหมดอายุแล้ว",404);return object;
}
