import {env} from "cloudflare:workers";
import {PartyError,advanceRoom,applyAction,newPlayer,newRoom,roomView,validateActions,type PartyState} from "./party-engine";
type Row={code:string;state:string;revision:number;expires_at:number};
const ttl=2*60*60*1000;
function database(){if(!env.DB)throw new Error("Party database binding is unavailable");return env.DB;}
async function keyOf(token:string){const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,"0")).join("");}
function identity(body:Record<string,unknown>){const name=typeof body.name==="string"?body.name.trim():"";const hero=body.hero;if(!name||name.length>20||!Number.isInteger(hero)||Number(hero)<0||Number(hero)>3)throw new PartyError("ใส่ชื่อและเลือกตัวละครก่อน");return{name,hero:Number(hero)};}
function roomCode(){const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";return Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>alphabet[n%32]).join("");}
export async function partyRequest(body:Record<string,unknown>,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw new PartyError("สิทธิ์เข้าห้องไม่ถูกต้อง กรุณาเข้าร่วมใหม่",401);
 const db=database(),key=await keyOf(token),now=Date.now();
 if(body.op==="create"){
  const {name,hero}=identity(body);const mission=Number(body.mission);if(!Number.isInteger(mission)||mission<0||mission>2)throw new PartyError("เลือกภารกิจก่อน");
  const existing=await db.prepare("SELECT code,state,revision,expires_at FROM party_rooms WHERE owner_key=?").bind(key).first<Row>();
  if(existing&&existing.expires_at>now){const s=JSON.parse(existing.state) as PartyState;return roomView(s,s.hostId,existing.revision,now);}
  await db.prepare("DELETE FROM party_rooms WHERE code IN (SELECT code FROM party_rooms WHERE expires_at<=? LIMIT 100)").bind(now).run();
  for(let attempt=0;attempt<5;attempt++){const code=roomCode(),p=newPlayer(crypto.randomUUID(),key,name,hero,now),s=newRoom(code,p,mission,now);const r=await db.prepare("INSERT OR IGNORE INTO party_rooms(code,owner_key,state,revision,expires_at) VALUES(?,?,?,0,?)").bind(code,key,JSON.stringify(s),now+ttl).run();if(r.meta.changes===1)return roomView(s,p.id,0,now);}
  throw new PartyError("สร้างห้องไม่สำเร็จ ลองอีกครั้ง",503);
 }
 const code=typeof body.code==="string"?body.code.toUpperCase().trim():"";if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))throw new PartyError("รหัสห้องต้องมี 6 ตัวอักษร");
 if(body.op!=="join"&&body.op!=="sync")throw new PartyError("คำขอไม่ถูกต้อง");
 const actions=validateActions(body.actions);
 for(let attempt=0;attempt<8;attempt++){
  const row=await db.prepare("SELECT code,state,revision,expires_at FROM party_rooms WHERE code=?").bind(code).first<Row>();
  if(!row||row.expires_at<=Date.now())throw new PartyError("ไม่พบห้องนี้ หรือห้องหมดอายุแล้ว",404);
  const s=JSON.parse(row.state) as PartyState,at=Date.now();let player=s.players.find(p=>p.key===key);
  if(body.op==="join"&&!player){const {name,hero}=identity(body);if(s.phase!=="lobby")throw new PartyError("ห้องนี้เริ่มเกมแล้ว รอเจ้าของห้องเปิดรอบใหม่",409);if(s.players.length>=2)throw new PartyError("ห้องเต็มแล้ว รับได้ 2 คน",409);player=newPlayer(crypto.randomUUID(),key,name,hero,at);s.players.push(player);s.players.forEach(p=>p.ready=false);}
  if(!player)throw new PartyError("คุณไม่ได้อยู่ในห้องนี้ กรุณาเข้าร่วมใหม่",401);
  if(s.phase!=="closed"){advanceRoom(s,at);player=s.players.find(p=>p.key===key)!;player.lastSeen=at;for(const action of actions)applyAction(s,player.id,action,at);advanceRoom(s,at);}
  const result=await db.prepare("UPDATE party_rooms SET state=?,revision=revision+1 WHERE code=? AND revision=?").bind(JSON.stringify(s),code,row.revision).run();
  if(result.meta.changes===1)return roomView(s,player.id,row.revision+1,at);
 }
 throw new PartyError("ห้องกำลังซิงก์ กรุณาลองอีกครั้ง",503);
}
