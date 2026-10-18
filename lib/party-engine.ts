// The same deterministic simulation runs for both players, only on the server.
export const RAID_RULES=[{hp:1100,duration:120,damage:13,interval:6.8},{hp:1450,duration:120,damage:16,interval:5.8},{hp:1600,duration:90,damage:20,interval:4.9}];
export const CONNECTION_GRACE=8000;
export type Phase="lobby"|"countdown"|"playing"|"paused"|"won"|"lost"|"closed";
export type PartyPlayer={id:string;key:string;name:string;hero:number;ready:boolean;lastSeen:number;ack:number;hp:number;maxHp:number;chargeAt:number|null;lastShot:number;shieldUntil:number;shieldReady:number;passReady:number;comboUntil:number;passes:number;blocks:number;hits:number;damage:number};
export type PartyParticle={id:number;kind:"shot"|"enemy"|"pass"|"reflect";from:number;to:number;x:number;y:number;tx:number;ty:number;born:number;duration:number;damage:number;combo?:boolean};
export type PartyNotice={id:number;text:string;x:number;y:number;born:number;kind:string};
export type PartyState={code:string;hostId:string;mission:number;phase:Phase;players:PartyPlayer[];time:number;lastTick:number;startAt:number;pausedBy:string|null;pauseReason:"manual"|"connection"|null;bossHp:number;bossMax:number;score:number;round:number;nextAttack:number;attackIndex:number;particles:PartyParticle[];notices:PartyNotice[];eventId:number};
export type PartyView=Omit<PartyState,"players">&{players:Omit<PartyPlayer,"key">[];selfId:string;serverNow:number;revision:number};
export type PartyAction={seq:number;type:"configure"|"ready"|"start"|"begin"|"release"|"cancel"|"pass"|"shield"|"pause"|"resume"|"rematch"|"leave"|"remove";hero?:number;mission?:number;name?:string;ready?:boolean;x?:number;y?:number};
export class PartyError extends Error{constructor(message:string,public status=400){super(message);}}
export function newPlayer(id:string,key:string,name:string,hero:number,now:number):PartyPlayer{return{id,key,name,hero,ready:false,lastSeen:now,ack:0,hp:hero===2?125:100,maxHp:hero===2?125:100,chargeAt:null,lastShot:-1,shieldUntil:0,shieldReady:0,passReady:0,comboUntil:0,passes:0,blocks:0,hits:0,damage:0};}
export function newRoom(code:string,player:PartyPlayer,mission:number,now:number):PartyState{const rules=RAID_RULES[mission];return{code,hostId:player.id,mission,phase:"lobby",players:[player],time:0,lastTick:now,startAt:0,pausedBy:null,pauseReason:null,bossHp:rules.hp,bossMax:rules.hp,score:0,round:0,nextAttack:rules.interval,attackIndex:0,particles:[],notices:[],eventId:0};}
export const playerX=(index:number)=>index===0?.26:.76;
export const bossPhase=(s:Pick<PartyState,"bossHp"|"bossMax">)=>s.bossHp>s.bossMax*.66?1:s.bossHp>s.bossMax*.33?2:3;
export const bossX=(s:Pick<PartyState,"bossHp"|"bossMax"|"time">)=>.5+Math.sin(s.time*.55)*(.045+(bossPhase(s)-1)*.025);
function notice(s:PartyState,text:string,x=.5,y=.46,kind="info"){s.notices.push({id:++s.eventId,text,x,y,born:s.time,kind});}
function pause(s:PartyState,now:number,reason:"manual"|"connection",by:string|null){s.phase="paused";s.pauseReason=reason;s.pausedBy=by;s.lastTick=now;s.players.forEach(p=>p.chargeAt=null);}
function hit(s:PartyState,damage:number,owner:number,combo=false){const actual=Math.min(s.bossHp,damage);s.bossHp=Math.max(0,s.bossHp-damage);s.score+=Math.round(actual*3);const p=s.players[owner];if(p){p.hits++;p.damage+=actual;}notice(s,"-"+Math.round(damage)+(combo?" COMBO":""),bossX(s),.2,combo?"combo":"hit");}
function step(s:PartyState,dt:number){
 const rules=RAID_RULES[s.mission];s.time+=dt;
 if(s.time>=s.nextAttack){const living=s.players.map((p,i)=>({p,i})).filter(v=>v.p.hp>0);const target=living[s.attackIndex%living.length];if(target){s.particles.push({id:++s.eventId,kind:"enemy",from:-1,to:target.i,x:bossX(s),y:.35,tx:playerX(target.i),ty:.79,born:s.time,duration:1.2,damage:rules.damage+(bossPhase(s)-1)*3});s.attackIndex++;}s.nextAttack=s.time+Math.max(3.1,rules.interval-(bossPhase(s)-1)*.8);}
 const keep:PartyParticle[]=[];const spawned:PartyParticle[]=[];
 for(const p of s.particles){if(s.time-p.born<p.duration){keep.push(p);continue;}
  if(p.kind==="enemy"){const target=s.players[p.to];if(!target||target.hp<=0)continue;if(target.shieldUntil>s.time){target.blocks++;s.score+=80;notice(s,"สะท้อนสำเร็จ!",playerX(p.to),.64,"shield");spawned.push({id:++s.eventId,kind:"reflect",from:p.to,to:-1,x:playerX(p.to),y:.76,tx:bossX(s),ty:.31,born:s.time,duration:.4,damage:35});}else{target.hp=Math.max(0,target.hp-p.damage);target.chargeAt=null;notice(s,"-"+p.damage+" HP",playerX(p.to),.64,"damage");}}
  else if(p.kind==="pass"){const target=s.players[p.to];if(target&&target.hp>0){target.comboUntil=s.time+6;notice(s,"รับพลังแล้ว! ยิงคอมโบ",playerX(p.to),.59,"combo");}}
  else if(p.kind==="reflect"||Math.abs(p.tx-bossX(s))<.17&&Math.abs(p.ty-.31)<.2){hit(s,p.damage,p.from,p.combo);}
  else notice(s,"เวทพลาดเป้า",p.tx,p.ty,"miss");
 }
 s.particles=[...keep,...spawned];s.notices=s.notices.filter(n=>s.time-n.born<1.7).slice(-12);
 if(s.bossHp<=0){s.phase="won";s.score+=Math.max(0,Math.round((rules.duration-s.time)*8+s.players.reduce((v,p)=>v+p.hp,0)*2+500));s.players.forEach(p=>p.chargeAt=null);}
 else if(s.players.every(p=>p.hp<=0)||s.time>=rules.duration){s.phase="lost";s.players.forEach(p=>p.chargeAt=null);}
}
export function advanceRoom(s:PartyState,now:number){
 const allHere=s.players.length===2&&s.players.every(p=>now-p.lastSeen<CONNECTION_GRACE);
 if((s.phase==="playing"||s.phase==="countdown")&&!allHere){pause(s,now,"connection",null);return;}
 if(s.phase==="paused"){if(s.pauseReason==="connection"&&allHere){s.phase="countdown";s.startAt=now+3000;s.pauseReason=null;}s.lastTick=now;return;}
 let since=s.lastTick;
 if(s.phase==="countdown"){if(now<s.startAt){s.lastTick=now;return;}s.phase="playing";since=Math.max(since,s.startAt);}
 if(s.phase==="playing"){let remain=Math.min(8,Math.max(0,(now-since)/1000));while(remain>0&&s.phase==="playing"){const dt=Math.min(.05,remain);step(s,dt);remain-=dt;}}
 s.lastTick=now;
}
function resetRound(s:PartyState,now:number){const rules=RAID_RULES[s.mission];s.time=0;s.lastTick=now;s.bossHp=rules.hp;s.bossMax=rules.hp;s.score=0;s.nextAttack=rules.interval;s.attackIndex=0;s.particles=[];s.notices=[];s.pauseReason=null;s.pausedBy=null;s.players=s.players.map(p=>({...newPlayer(p.id,p.key,p.name,p.hero,now),ack:p.ack,ready:p.ready,lastSeen:p.lastSeen}));}
export function applyAction(s:PartyState,selfId:string,a:PartyAction,now:number){
 const p=s.players.find(p=>p.id===selfId);if(!p)throw new PartyError("คุณไม่ได้อยู่ในห้องนี้",403);
 if(a.seq<=p.ack)return;if(a.seq!==p.ack+1)throw new PartyError("กำลังซิงก์คำสั่ง ลองเชื่อมต่อใหม่",409);
 const host=selfId===s.hostId,index=s.players.indexOf(p),other=s.players[1-index];
 if(a.type==="leave"){if(host){s.phase="closed";s.players.forEach(p=>p.chargeAt=null);}else{s.players=s.players.filter(v=>v.id!==selfId);s.phase="lobby";s.players.forEach(v=>v.ready=false);}p.ack=a.seq;return;}
 if(a.type==="configure"){if(s.phase!=="lobby")throw new PartyError("ปรับตัวละครได้ก่อนเริ่มรอบเท่านั้น",409);if(a.mission!==undefined){if(!host)throw new PartyError("เจ้าของห้องเป็นผู้เลือกภารกิจ",403);s.mission=a.mission;s.players.forEach(v=>v.ready=false);}if(a.hero!==undefined){p.hero=a.hero;p.ready=false;}if(a.name!==undefined)p.name=a.name;}
 else if(a.type==="ready"){if(s.phase!=="lobby")throw new PartyError("รอบนี้เริ่มแล้ว",409);p.ready=!!a.ready;}
 else if(a.type==="remove"){if(!host||s.phase!=="lobby"||!other||now-other.lastSeen<30000)throw new PartyError("นำผู้เล่นออกได้เมื่อขาดการเชื่อมต่อเกิน 30 วินาที",409);s.players=[p];p.ready=false;}
 else if(a.type==="start"){if(!host||s.phase!=="lobby"||s.players.length!==2||!s.players.every(v=>v.ready&&now-v.lastSeen<CONNECTION_GRACE))throw new PartyError("รอผู้เล่นทั้งสองคนเชื่อมต่อและกดพร้อม",409);resetRound(s,now);s.round++;s.phase="countdown";s.startAt=now+3000;}
 else if(a.type==="rematch"){if(!host||!["won","lost","paused"].includes(s.phase))throw new PartyError("เจ้าของห้องเริ่มรอบใหม่ได้เมื่อจบรอบหรือพักเกม",409);s.phase="lobby";resetRound(s,now);s.players.forEach(v=>v.ready=false);}
 else if(a.type==="pause"){if(s.phase==="playing"||s.phase==="countdown")pause(s,now,"manual",selfId);}
 else if(a.type==="resume"){if(s.phase!=="paused"||s.pauseReason!=="manual"||(!host&&s.pausedBy!==selfId))throw new PartyError("รอเจ้าของห้องหรือคนที่พักเกมกดเล่นต่อ",403);if(!s.players.every(v=>now-v.lastSeen<CONNECTION_GRACE))throw new PartyError("รอเพื่อนเชื่อมต่อก่อน",409);s.phase="countdown";s.startAt=now+3000;s.pauseReason=null;s.pausedBy=null;}
 else if(s.phase==="playing"&&p.hp>0){
  if(a.type==="begin"&&s.time-p.lastShot>=.35){if(p.chargeAt===null)p.chargeAt=s.time;}
  else if(a.type==="cancel")p.chargeAt=null;
  else if(a.type==="release"){if(p.chargeAt!==null){const charge=Math.min(1,(s.time-p.chargeAt)/1.3);p.chargeAt=null;if(charge>=.06&&s.time-p.lastShot>=.35){const combo=p.comboUntil>s.time;let damage=(15+60*charge)*(p.hero===0?1.2:1);if(s.mission===2&&charge>=.95)damage*=1.3;if(combo){damage*=other&&other.hero!==p.hero?1.8:1.6;if(s.mission===1)damage*=1.5;p.comboUntil=0;}p.lastShot=s.time;s.particles.push({id:++s.eventId,kind:"shot",from:index,to:-1,x:playerX(index),y:.78,tx:a.x!,ty:a.y!,born:s.time,duration:.4,damage:Math.round(damage),combo});}}}
  else if(a.type==="pass"&&s.time>=p.passReady&&other&&other.hp>0){p.chargeAt=null;p.passReady=s.time+(p.hero===3?6:8);p.passes++;s.particles.push({id:++s.eventId,kind:"pass",from:index,to:1-index,x:playerX(index),y:.74,tx:playerX(1-index),ty:.74,born:s.time,duration:.55,damage:0});notice(s,"ส่งพลังให้ "+other.name,playerX(index),.62,"combo");}
  else if(a.type==="shield"&&s.time>=p.shieldReady){p.chargeAt=null;p.shieldUntil=s.time+(p.hero===1?4.1:3.1);p.shieldReady=s.time+7;notice(s,"โล่พร้อม",playerX(index),.64,"shield");}
 }
 const current=s.players.find(v=>v.id===selfId);if(current)current.ack=a.seq;
}
export function roomView(s:PartyState,selfId:string,revision:number,now:number):PartyView{return{...s,players:s.players.map(({key:_,...p})=>p),selfId,revision,serverNow:now};}
export function validateActions(value:unknown):PartyAction[]{
 if(value===undefined)return[];if(!Array.isArray(value)||value.length>16)throw new PartyError("คำสั่งมากเกินไป");
 const types=["configure","ready","start","begin","release","cancel","pass","shield","pause","resume","rematch","leave","remove"];
 return value.map(a=>{if(!a||typeof a!=="object"||!Number.isSafeInteger(a.seq)||a.seq<1||!types.includes(a.type))throw new PartyError("คำสั่งไม่ถูกต้อง");
  if(a.hero!==undefined&&(!Number.isInteger(a.hero)||a.hero<0||a.hero>3))throw new PartyError("ตัวละครไม่ถูกต้อง");
  if(a.mission!==undefined&&(!Number.isInteger(a.mission)||a.mission<0||a.mission>2))throw new PartyError("ภารกิจไม่ถูกต้อง");
  if(a.name!==undefined&&(typeof a.name!=="string"||!a.name.trim()||a.name.length>20))throw new PartyError("ชื่อต้องยาว 1–20 ตัวอักษร");
  if(a.ready!==undefined&&typeof a.ready!=="boolean")throw new PartyError("สถานะพร้อมไม่ถูกต้อง");
  if(a.type==="release"&&![a.x,a.y].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1))throw new PartyError("ตำแหน่งเล็งไม่ถูกต้อง");
  return a as PartyAction;
 });
}
