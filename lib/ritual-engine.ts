import {GESTURES,NODES,traceNodes,canSendVoice,sanitizeSignal,type RitualRole,type Rune,type TracePoint,type SilentSignal} from "./ritual-shared";
export type RitualPhase="lobby"|"countdown"|"playing"|"paused"|"won"|"lost"|"closed";
export class RitualError extends Error{constructor(message:string,public status=400){super(message);}}
export type RitualPlayer={id:string;key:string;name:string;role:RitualRole;ready:boolean;lastSeen:number;ack:number;casts:number;relays:number;chatAt:number;traceAt:number|null};
export type Recipe={id:string;rune:Rune;path:number[];gesture:string};
export type RitualMessage={id:number;from:string;fromRole:RitualRole;to:RitualRole;name:string;text:string;at:number;voice?:{id:string;mime:string};signal?:SilentSignal};
export type RitualState={code:string;hostId:string;players:RitualPlayer[];phase:RitualPhase;createdAt:number;updatedAt:number;expiresAt:number;round:number;time:number;duration:number;startAt:number;pauseReason:"manual"|"connection"|null;pausedBy:string|null;pausedPhase:"countdown"|"playing";integrity:number;stage:number;total:number;score:number;strikes:number;recipes:Recipe[];order:string[];challenge:string;castReady:number;feedback:{id:number;kind:"success"|"error";text:string}|null;messages:RitualMessage[];voiceCount:number;eventId:number};
export type RitualAction={seq:number;type:"role"|"ready"|"start"|"begin"|"cancel"|"cast"|"chat"|"signal"|"pause"|"resume"|"rematch"|"leave"|"remove"|"rotate";role?:RitualRole;ready?:boolean;to?:RitualRole;text?:string;challenge?:string;path?:TracePoint[];gesture?:string;hold?:number;playerId?:string;signal?:SilentSignal};
const roles:RitualRole[]=["caster","scribe","relay"];
const templates=[[1,2,5,8,9],[7,4,1,2,3],[1,4,5,6,9],[3,2,5,4,7],[7,8,5,2,1],[1,5,9,6,3],[3,5,7,8,9],[9,8,5,2,3],[3,6,5,4,1],[9,5,1,4,7],[7,5,3,2,1],[1,2,3,6,9]];
function random(n:number){const x=new Uint32Array(1);crypto.getRandomValues(x);return x[0]%n;}
function shuffle<T>(items:T[]){const a=[...items];for(let i=a.length-1;i>0;i--){const j=random(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function recipes(){const paths=shuffle(templates);return shuffle(Array.from({length:6},(_,i)=>({id:crypto.randomUUID(),rune:{symbol:i%3,tint:Math.floor(i/2),rings:1+i%2},path:[...paths[i]],gesture:GESTURES[random(GESTURES.length)].id})));}
export function ritualPlayer(id:string,key:string,name:string,role:RitualRole,now:number):RitualPlayer{return{id,key,name,role,ready:false,lastSeen:now,ack:0,casts:0,relays:0,chatAt:0,traceAt:null};}
export function ritualRoom(code:string,host:RitualPlayer,now:number):RitualState{return{code,hostId:host.id,players:[host],phase:"lobby",createdAt:now,updatedAt:now,expiresAt:now+7200000,round:0,time:0,duration:240,startAt:0,pauseReason:null,pausedBy:null,pausedPhase:"playing",integrity:100,stage:0,total:5,score:0,strikes:0,recipes:[],order:[],challenge:"",castReady:0,feedback:null,messages:[],voiceCount:0,eventId:0};}
function connected(s:RitualState,now:number){return s.players.length===3&&s.players.every(p=>now-p.lastSeen<12000);}
function clearTraces(s:RitualState){s.players.forEach(p=>p.traceAt=null);}
function prepare(s:RitualState,now:number){s.phase="lobby";s.time=0;s.integrity=100;s.stage=0;s.strikes=0;s.score=0;s.feedback=null;s.recipes=[];s.order=[];s.messages=[];s.pauseReason=null;s.pausedBy=null;s.challenge="";s.updatedAt=now;s.players.forEach(p=>{p.ready=false;p.traceAt=null;p.casts=0;p.relays=0;});}
function pause(s:RitualState,reason:"manual"|"connection",by:string|null){s.pausedPhase=s.phase==="countdown"?"countdown":"playing";s.phase="paused";s.pauseReason=reason;s.pausedBy=by;clearTraces(s);}
export function advanceRitual(s:RitualState,now:number){
 const before=s.updatedAt;s.updatedAt=now;
 if((s.phase==="playing"||s.phase==="countdown")&&!connected(s,now)){pause(s,"connection",null);return;}
 if(s.phase==="paused"&&s.pauseReason==="connection"&&connected(s,now)){s.phase="countdown";s.startAt=now+3000;s.pauseReason=null;return;}
 if(s.phase==="countdown"){if(now>=s.startAt){s.phase="playing";s.time+=Math.max(0,(now-Math.max(before,s.startAt))/1000);}else return;}
 else if(s.phase==="playing")s.time+=Math.max(0,(now-before)/1000);
 if(s.phase==="playing"&&s.time>=s.duration){s.time=s.duration;s.phase="lost";clearTraces(s);}
}
function permittedMessage(from:RitualRole,to:RitualRole){return from==="relay"?(to==="caster"||to==="scribe"):to==="relay";}
export function addRitualMessage(s:RitualState,p:RitualPlayer,to:RitualRole,text:string,now:number,voice?:{id:string;mime:string},signal?:SilentSignal){
 if(!permittedMessage(p.role,to))throw new RitualError("สองฝั่งต้องสื่อสารผ่านคนกลางเท่านั้น",403);
 if(signal&&(!sanitizeSignal(signal)||voice))throw new RitualError("แผ่นสัญลักษณ์ไม่ถูกต้อง");
 if(signal&&(p.role!=="scribe"||to!=="relay"))throw new RitualError("อิวาซารุส่งแผ่นสัญลักษณ์ให้มิซารุเท่านั้น",403);
 if(p.role==="scribe"&&!signal)throw new RitualError("อิวาซารุรักษาวาจา ใช้แผ่นสัญลักษณ์แทนข้อความหรือเสียง",403);
 if(voice&&!canSendVoice(p.role,to))throw new RitualError("พันธสัญญานี้ไม่อนุญาตให้ส่งเสียงในช่องนี้",403);
 if(s.phase==="closed")throw new RitualError("ห้องนี้ปิดแล้ว",409);
 if(now-p.chatAt<700)throw new RitualError("รอข้อความก่อนหน้าส่งสักครู่",429);
 if(!voice&&!signal&&(!text.trim()||text.length>280))throw new RitualError("ข้อความต้องมี 1–280 ตัวอักษร");
 if(voice&&s.voiceCount>=300)throw new RitualError("ห้องนี้ส่งเสียงครบ 300 ครั้งแล้ว ใช้ข้อความต่อได้",409);
 if(voice)s.voiceCount++;p.chatAt=now;p.relays++;s.messages.push({id:++s.eventId,from:p.id,fromRole:p.role,to,name:p.name,text:signal?"":text.trim(),at:now,...(voice?{voice}:{}),...(signal?{signal:sanitizeSignal(signal)!}:{})});s.messages=s.messages.slice(-80);
}
function inCorridor(point:TracePoint,route:number[]){return route.slice(1).some((id,i)=>{const a=NODES[route[i]-1],b=NODES[id-1],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy)<.12;});}
export function correctCircuit(path:TracePoint[],route:number[]){const visited=traceNodes(path);return visited.length===route.length&&visited.every((n,i)=>n===route[i])&&path.every(p=>inCorridor(p,route))&&path.every((p,i)=>i===0||Math.hypot(p.x-path[i-1].x,p.y-path[i-1].y)<.18);}
export function applyRitualAction(s:RitualState,id:string,a:RitualAction,now:number){
 const p=s.players.find(p=>p.id===id);if(!p)throw new RitualError("คุณไม่ได้อยู่ในห้อง",401);if(a.seq<=p.ack)return;
 const host=id===s.hostId;
 if(a.type==="leave"){p.ack=a.seq;if(host)s.phase="closed";else{s.players=s.players.filter(x=>x.id!==id);prepare(s,now);}return;}
 if(a.type==="chat"){addRitualMessage(s,p,a.to!,a.text!,now);p.ack=a.seq;return;}
 if(a.type==="signal"){addRitualMessage(s,p,a.to!,"",now,undefined,a.signal);p.ack=a.seq;return;}
 if(a.type==="role"){if(s.phase!=="lobby")throw new RitualError("เปลี่ยนบทบาทได้ก่อนเริ่มรอบเท่านั้น",409);if(s.players.some(x=>x.id!==id&&x.role===a.role))throw new RitualError("บทบาทนี้มีเพื่อนเลือกแล้ว",409);p.role=a.role!;s.players.forEach(x=>x.ready=false);}
 else if(a.type==="rotate"){if(!host||s.phase!=="lobby"||s.players.length!==3)throw new RitualError("เจ้าของห้องสลับบทบาทได้เมื่อครบ 3 คนในห้องเตรียมตัว",403);s.players.forEach(x=>{x.role=roles[(roles.indexOf(x.role)+1)%roles.length];x.ready=false;});s.messages=[];}
 else if(a.type==="ready"){if(s.phase!=="lobby")throw new RitualError("รอบนี้เริ่มแล้ว",409);p.ready=!!a.ready;}
 else if(a.type==="remove"){if(!host||s.phase!=="lobby")throw new RitualError("เจ้าของห้องจัดการผู้เล่นได้ในห้องเตรียมตัว",403);s.players=s.players.filter(x=>x.id===id||x.id!==a.playerId||now-x.lastSeen<30000);s.players.forEach(x=>x.ready=false);}
 else if(a.type==="start"){
  if(!host||s.phase!=="lobby"||!connected(s,now)||!s.players.every(x=>x.ready)||new Set(s.players.map(x=>x.role)).size!==3)throw new RitualError("ต้องครบ 3 บทบาทและทุกคนพร้อม เจ้าของห้องจึงเริ่มได้",409);
  s.recipes=recipes();s.order=shuffle(s.recipes.map(r=>r.id)).slice(0,s.total);s.challenge=crypto.randomUUID();s.phase="countdown";s.startAt=now+3000;s.round++;s.messages=[];s.feedback=null;s.time=0;s.stage=0;s.integrity=100;s.score=0;s.strikes=0;s.castReady=0;s.players.forEach(x=>{x.casts=0;x.relays=0;x.traceAt=null;});
 }
 else if(a.type==="pause"){if(s.phase==="playing"||s.phase==="countdown")pause(s,"manual",id);}
 else if(a.type==="resume"){if(s.phase!=="paused"||s.pauseReason!=="manual"||(!host&&s.pausedBy!==id)||!connected(s,now))throw new RitualError("รอครบทีม แล้วให้คนพักหรือเจ้าของห้องเล่นต่อ",409);s.phase="countdown";s.startAt=now+3000;s.pauseReason=null;s.pausedBy=null;}
 else if(a.type==="rematch"){if(!host||!["won","lost","paused"].includes(s.phase))throw new RitualError("เจ้าของห้องเริ่มรอบใหม่ได้หลังจบหรือพักเกม",403);prepare(s,now);}
 else {
  if(p.role!=="caster")throw new RitualError("คิคาซารุเท่านั้นที่วาดวงจรได้",403);
  if(s.phase!=="playing")throw new RitualError("รอให้เกมเริ่มก่อนร่ายเวท",409);
  if(a.type==="begin"){if(s.time>=s.castReady)p.traceAt=s.time;}
  else if(a.type==="cancel")p.traceAt=null;
  else if(a.type==="cast"){
   if(a.challenge!==s.challenge||s.time<s.castReady){p.ack=a.seq;return;}
   if(p.traceAt===null||s.time-p.traceAt<1||a.hold!<650)throw new RitualError("เริ่มวาดก่อน แล้วทำท่าปิดผนึกค้างอย่างน้อย 0.7 วินาที");
   const recipe=s.recipes.find(r=>r.id===s.order[s.stage])!,goodPath=correctCircuit(a.path!,recipe.path),goodGesture=a.gesture===recipe.gesture;
   p.traceAt=null;p.casts++;s.castReady=s.time+2;
   if(goodPath&&goodGesture){s.stage++;s.score+=1000;s.feedback={id:++s.eventId,kind:"success",text:"ผนึกสำเร็จ — ความเข้าใจร่วมกันทำให้เงาอคติจางลง"};s.challenge=crypto.randomUUID();if(s.stage===s.total){s.phase="won";s.score+=Math.round((s.duration-s.time)*5+s.integrity*10);}}
   else{s.strikes++;s.integrity=Math.max(0,s.integrity-20);s.feedback={id:++s.eventId,kind:"error",text:goodPath?"วงจรถูก แต่ท่าปิดผนึกยังไม่ใช่ ลองถามคนกลางอีกที":"วงจรยังไม่ตรงตำรา เช็กจุดเริ่ม ลำดับ และเส้นที่ลาก"};if(s.integrity<=0)s.phase="lost";}
  }
 }
 p.ack=a.seq;
}
export function validateRitualActions(input:unknown):RitualAction[]{
 if(input===undefined)return[];if(!Array.isArray(input)||input.length>12)throw new RitualError("คำสั่งมากเกินไป");
 return input.map(value=>{if(!value||typeof value!=="object")throw new RitualError("คำสั่งไม่ถูกต้อง");const a=value as RitualAction;
 if(!Number.isSafeInteger(a.seq)||a.seq<1||!["role","ready","start","begin","cancel","cast","chat","signal","pause","resume","rematch","leave","remove","rotate"].includes(a.type))throw new RitualError("คำสั่งไม่ถูกต้อง");
 if(a.type==="role"&&!roles.includes(a.role!))throw new RitualError("บทบาทไม่ถูกต้อง");
 if(a.type==="ready"&&typeof a.ready!=="boolean")throw new RitualError("สถานะพร้อมไม่ถูกต้อง");
 if(a.type==="chat"&&(!roles.includes(a.to!)||typeof a.text!=="string"||!a.text.trim()||a.text.length>280))throw new RitualError("ข้อความไม่ถูกต้อง");
 if(a.type==="signal"){const signal=sanitizeSignal(a.signal);if(a.to!=="relay"||!signal)throw new RitualError("แผ่นสัญลักษณ์ไม่ถูกต้อง");return{seq:a.seq,type:"signal",to:"relay",signal};}
 if(a.type==="remove"&&(typeof a.playerId!=="string"||a.playerId.length>80))throw new RitualError("ผู้เล่นไม่ถูกต้อง");
 if(a.type==="cast"){
  if(typeof a.challenge!=="string"||a.challenge.length>80||!GESTURES.some(g=>g.id===a.gesture)||!Number.isFinite(a.hold)||a.hold!<0||a.hold!>10000||!Array.isArray(a.path)||a.path.length<2||a.path.length>200)throw new RitualError("ข้อมูลวงจรไม่ครบ");
  if(a.path.some((p,i)=>!p||![p.x,p.y,p.t].every(Number.isFinite)||p.x<0||p.x>1||p.y<0||p.y>1||p.t<0||p.t>240000||i>0&&p.t<a.path![i-1].t))throw new RitualError("ตำแหน่งวงจรไม่ถูกต้อง");
 }
 return a;});
}
export function ritualView(s:RitualState,selfId:string,revision:number,now:number){
 const self=s.players.find(p=>p.id===selfId);const role=self?.role;const active=!["lobby","closed"].includes(s.phase);
 return{code:s.code,hostId:s.hostId,selfId,revision,serverNow:now,expiresAt:s.expiresAt,phase:s.phase,round:s.round,time:s.time,duration:s.duration,startAt:s.startAt,pauseReason:s.pauseReason,pausedBy:s.pausedBy,integrity:s.integrity,stage:s.stage,total:s.total,score:s.score,strikes:s.strikes,
 players:s.players.map(({key,traceAt,chatAt,...p})=>p),
 messages:s.messages.filter(m=>m.from===selfId||m.to===role).map(m=>role==="caster"&&m.voice?{...m,voice:undefined,text:"ส่งเสียงแล้ว · คิคาซารุไม่ฟังเสียง"}:m),
 ...(active&&role==="scribe"?{manual:s.recipes}:{}),
 ...(active&&role==="caster"?{target:s.recipes.find(r=>r.id===s.order[s.stage])?.rune||null,challenge:s.challenge,castReady:s.castReady,feedback:s.feedback}:{}),
 };
}
export type RitualView=ReturnType<typeof ritualView>;
