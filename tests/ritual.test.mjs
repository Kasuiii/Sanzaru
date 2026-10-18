import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID} from 'node:crypto';
const db=new DatabaseSync(':memory:');
for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const objects=new Map(),defer=()=>new Promise(r=>setImmediate(r));
globalThis.__ritualTestEnv={DB:{prepare(sql){return{bind(...args){return{
 async first(){await defer();return db.prepare(sql).get(...args)||null;},
 async all(){await defer();return {results:db.prepare(sql).all(...args)};},
 async run(){await defer();return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}
};}};}},BUCKET:{async put(key,data,options){objects.set(key,{data,options});},async get(key){const o=objects.get(key);return o?{body:o.data,httpMetadata:o.options.httpMetadata}:null;},async delete(keys){for(const k of Array.isArray(keys)?keys:[keys])objects.delete(k);},async list({prefix}){return{objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}}};
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compile=p=>ts.transpileModule(fs.readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const shared=url(compile('../lib/ritual-shared.ts'));
const {nextRitualBatch}=await import(url(compile('../lib/ritual-batch.ts')));
const engine=url(compile('../lib/ritual-engine.ts').replace('"./ritual-shared"',JSON.stringify(shared)));
const store=url(compile('../lib/ritual-store.ts').replace('"./ritual-shared"',JSON.stringify(shared)).replace('import { env } from "cloudflare:workers";','const env=globalThis.__ritualTestEnv;').replace('"./ritual-engine"',JSON.stringify(engine)));
const route=url(compile('../app/api/ritual/route.ts').replace('"@/lib/ritual-store"',JSON.stringify(store)).replace('"@/lib/ritual-engine"',JSON.stringify(engine)));
const audioRoute=url(compile('../app/api/ritual/voice/route.ts').replace('"@/lib/ritual-store"',JSON.stringify(store)).replace('"@/lib/ritual-engine"',JSON.stringify(engine)));
const {POST}=await import(route),voice=await import(audioRoute),{NODES}=await import(shared),{correctCircuit}=await import(engine);
const token=()=>randomBytes(32).toString('hex'),caster=token(),scribe=token(),relay=token(),outsider=token(),tokens=[caster,scribe,relay],seq=new Map(tokens.map(t=>[t,0]));
let now=Date.now();Date.now=()=>now;let code;
async function call(t,body,status=200){const res=await POST(new Request('https://ritual-test.invalid/api/ritual',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify(body)})),data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data.room||data;}
async function action(t,a,status=200){const next=seq.get(t)+1;const v=await call(t,{op:'sync',code,actions:[{seq:next,...a}]},status);if(status===200)seq.set(t,next);return v;}
async function sync(t){return call(t,{op:'sync',code});}
async function tick(ms){now+=ms;return Promise.all(tokens.map(sync));}
const first=await call(caster,{op:'create',name:'Caster',role:'caster'});code=first.code;
assert.equal((await call(caster,{op:'create',name:'Caster',role:'caster'})).code,code);
await call(scribe,{op:'join',code,name:'Scribe',role:'scribe'});await call(relay,{op:'join',code,name:'Relay',role:'relay'});
await call(outsider,{op:'join',code,name:'Fourth',role:'caster'},409);await call(outsider,{op:'sync',code},401);
await action(scribe,{type:'role',role:'caster'},409);
await action(caster,{type:'ready',ready:true});
await action(scribe,{type:'rotate'},403);
for(let i=0;i<3;i++){
 const rotated=await action(caster,{type:'rotate'});
 assert.equal(new Set(rotated.players.map(p=>p.role)).size,3);
 assert(rotated.players.every(p=>!p.ready));
 assert.equal(rotated.players.find(p=>p.id===rotated.selfId).role,['scribe','relay','caster'][i]);
}

await Promise.all(tokens.map(t=>action(t,{type:'ready',ready:true})));
await action(scribe,{type:'start'},409);
assert.equal((await action(caster,{type:'start'})).phase,'countdown');
let [cv,sv,rv]=await tick(3100);
assert.equal(cv.phase,'playing');await action(caster,{type:'rotate'},403);assert.equal(sv.manual.length,6);
assert(!('manual' in cv));assert(!('target' in sv));assert(!('challenge' in sv));assert(!('manual' in rv));assert(!('target' in rv));assert(!('order' in cv));assert(!JSON.stringify(cv).includes('gesture'));assert(!JSON.stringify(rv).includes('recipes'));assert(tokens.every(t=>!JSON.stringify(cv).includes(t)));assert(cv.players.every(p=>!('key' in p)&&!('traceAt' in p)));
await action(caster,{type:'chat',to:'scribe',text:'bypass'},403);
cv=await action(caster,{type:'chat',to:'relay',text:'Caster secret clue'});rv=await sync(relay);sv=await sync(scribe);assert.equal(rv.messages.at(-1).text,'Caster secret clue');assert(!sv.messages.some(m=>m.text==='Caster secret clue'));
now+=800;await action(relay,{type:'chat',to:'scribe',text:'Rephrased by relay'});sv=await sync(scribe);cv=await sync(caster);assert(sv.messages.some(m=>m.text==='Rephrased by relay'));assert(!cv.messages.some(m=>m.text==='Rephrased by relay'));

// Three vows are enforced by the API, including callers that bypass the UI.
await action(scribe,{type:'chat',to:'relay',text:'I cannot send free text'},403);
const silent={kind:'route',nodes:[1,2,5,8,9],gesture:'Victory'};
await action(caster,{type:'signal',to:'relay',signal:silent},403);
await action(relay,{type:'signal',to:'relay',signal:silent},403);
for(const signal of [null,{...silent,nodes:[1]},{...silent,nodes:[1,10]},{...silent,nodes:[1,'2']},{...silent,gesture:'not-a-seal'},{kind:'intent',intent:'arbitrary words'}])
 await action(scribe,{type:'signal',to:'relay',signal},400);
await action(scribe,{type:'signal',to:'caster',signal:silent},400);
sv=await action(scribe,{type:'signal',to:'relay',signal:{...silent,secretText:'must-not-survive'},text:'must-not-survive'});
rv=await sync(relay);cv=await sync(caster);
assert.deepEqual(rv.messages.at(-1).signal,silent);
assert.equal(rv.messages.at(-1).text,'');
assert(!JSON.stringify(rv).includes('must-not-survive'));
assert(!cv.messages.some(m=>m.signal));
const signalSeq=seq.get(scribe);
await call(scribe,{op:'sync',code,actions:[{seq:signalSeq,type:'signal',to:'relay',signal:silent}]});
assert.equal((await sync(relay)).messages.filter(m=>m.signal?.kind==='route').length,1);
await action(scribe,{type:'signal',to:'relay',signal:{kind:'intent',intent:'ack'}},429);
now+=750;await action(scribe,{type:'signal',to:'relay',signal:{kind:'intent',intent:'ack'}});
assert.equal((await sync(relay)).messages.at(-1).signal.intent,'ack');
assert.equal(nextRitualBatch([{seq:1,type:'signal',to:'relay',signal:silent},{seq:2,type:'signal',to:'relay',signal:silent}]).length,1);

// Two queued relay chats must commit separately; retrying the second after a
// 429 preserves its sequence and never duplicates the first message.
now+=800;
let queued=[{seq:seq.get(relay)+1,type:'chat',to:'caster',text:'Queued clue one'},
 {seq:seq.get(relay)+2,type:'chat',to:'scribe',text:'Queued clue two'}];
assert.equal(nextRitualBatch(queued).length,1);
let response=await call(relay,{op:'sync',code,actions:nextRitualBatch(queued)});
seq.set(relay,queued[0].seq);queued.shift();
await call(relay,{op:'sync',code,actions:nextRitualBatch(queued)},429);
assert.equal((await sync(relay)).players.find(p=>p.id===response.selfId).ack,seq.get(relay));
now+=750;response=await call(relay,{op:'sync',code,actions:nextRitualBatch(queued)});
seq.set(relay,queued[0].seq);
assert.equal(response.messages.filter(m=>m.text==='Queued clue one').length,1);
assert.equal(response.messages.filter(m=>m.text==='Queued clue two').length,1);
const longQueue=Array.from({length:32},(_,i)=>({seq:i+1,type:'ready',ready:true}));
assert.equal(nextRitualBatch(longQueue).length,12);
assert.equal(longQueue.length,32);
now+=800;const voiceId=randomUUID();

async function postVoice(t,to,id=voiceId,status=200){const form=new FormData();form.set('code',code);form.set('to',to);form.set('id',id);form.set('audio',new Blob([new Uint8Array(150)],{type:'audio/webm'}),'clip.webm');const res=await voice.POST(new Request('https://ritual-test.invalid/api/ritual/voice',{method:'POST',headers:{Authorization:'Bearer '+t},body:form}));assert.equal(res.status,status,await res.text());}
await postVoice(caster,'scribe',randomUUID(),403);await postVoice(caster,'relay');await postVoice(caster,'relay');
for(const [t,status] of [[caster,403],[relay,200],[scribe,403],[outsider,403]]){const res=await voice.GET(new Request('https://ritual-test.invalid/api/ritual/voice?code='+code+'&id='+voiceId,{headers:{Authorization:'Bearer '+t}}));assert.equal(res.status,status);}
// Iwazaru cannot upload voice; Kikazaru cannot receive or replay voice.
const objectCount=objects.size;
await postVoice(scribe,'relay',randomUUID(),403);
await postVoice(relay,'caster',randomUUID(),403);
await postVoice(relay,'relay',randomUUID(),403);
assert.equal(objects.size,objectCount,'Rejected voice must not create an object');
assert(!(await sync(caster)).messages.some(m=>m.voice),'No voice handles for Kikazaru');
now+=800;const scribeVoiceId=randomUUID();await postVoice(relay,'scribe',scribeVoiceId);
for(const [t,status] of [[relay,200],[scribe,200],[caster,403],[outsider,403]]){
 const res=await voice.GET(new Request('https://ritual-test.invalid/api/ritual/voice?code='+code+'&id='+scribeVoiceId,{headers:{Authorization:'Bearer '+t}}));assert.equal(res.status,status);
}
function pathFor(route){const path=[{...NODES[route[0]-1],t:0}];delete path[0].id;for(let k=1;k<route.length;k++){const a=NODES[route[k-1]-1],b=NODES[route[k]-1];for(let i=1;i<=12;i++)path.push({x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,t:path.length*30});}return path;}
cv=await sync(caster);sv=await sync(scribe);let recipe=sv.manual.find(m=>JSON.stringify(m.rune)===JSON.stringify(cv.target));assert(recipe);const goodPath=pathFor(recipe.path);assert(correctCircuit(goodPath,recipe.path));assert(!correctCircuit([...goodPath].reverse(),recipe.path));assert(!correctCircuit([{x:.2,y:.2,t:0},{x:.8,y:.8,t:100}],recipe.path));
await action(scribe,{type:'begin'},403);await action(caster,{type:'begin'});await tick(1200);
await action(caster,{type:'cast',challenge:cv.challenge,path:goodPath,gesture:recipe.gesture,hold:100},400);
const wrongGesture=recipe.gesture==='Open_Palm'?'Closed_Fist':'Open_Palm';cv=await action(caster,{type:'cast',challenge:cv.challenge,path:goodPath,gesture:wrongGesture,hold:850});assert.equal(cv.integrity,80);assert.equal(cv.stage,0);assert.match(cv.feedback.text,/ท่าปิดผนึก/);
assert(!('feedback' in await sync(scribe)));await tick(2100);
for(let stage=0;stage<5;stage++){
 cv=await sync(caster);sv=await sync(scribe);recipe=sv.manual.find(m=>JSON.stringify(m.rune)===JSON.stringify(cv.target));await action(caster,{type:'begin'});await tick(1300);
 const result=await action(caster,{type:'cast',challenge:cv.challenge,path:pathFor(recipe.path),gesture:recipe.gesture,hold:850});assert.equal(result.stage,stage+1);
 const repeated=await call(caster,{op:'sync',code,actions:[{seq:seq.get(caster),type:'cast',challenge:cv.challenge,path:pathFor(recipe.path),gesture:recipe.gesture,hold:850}]});assert.equal(repeated.stage,result.stage);
 if(stage<4)await tick(2100);else{assert.equal(result.phase,'won');assert(result.score>=5000);}
}
await action(caster,{type:'rematch'});[cv,sv,rv]=await tick(1);assert.equal(cv.phase,'lobby');assert(!sv.manual);assert.equal(rv.messages.length,0);
await Promise.all(tokens.map(t=>action(t,{type:'ready',ready:true})));await action(caster,{type:'start'});await tick(3100);
await action(relay,{type:'pause'});assert.equal((await sync(caster)).phase,'paused');await action(scribe,{type:'resume'},409);await action(relay,{type:'resume'});await tick(3100);
now+=13000;cv=await sync(caster);assert.equal(cv.pauseReason,'connection');const pausedTime=cv.time;await sync(scribe);rv=await sync(relay);assert.equal(rv.phase,'countdown');assert.equal(rv.time,pausedTime);await tick(3100);
await action(scribe,{type:'role',role:'relay'},409);
for(let i=0;i<5;i++){cv=await sync(caster);sv=await sync(scribe);recipe=sv.manual.find(m=>JSON.stringify(m.rune)===JSON.stringify(cv.target));await action(caster,{type:'begin'});await tick(1100);cv=await action(caster,{type:'cast',challenge:cv.challenge,path:pathFor(recipe.path),gesture:recipe.gesture==='Open_Palm'?'Closed_Fist':'Open_Palm',hold:850});if(i<4)await tick(2100);}
assert.equal(cv.integrity,0);assert.equal(cv.phase,'lost');await action(caster,{type:'rematch'});
await action(relay,{type:'leave'});assert.equal((await sync(caster)).players.length,2);await call(relay,{op:'sync',code},401);
await action(caster,{type:'leave'});assert.equal((await sync(scribe)).phase,'closed');
console.log('PASS: Sanzaru vows, silent cards, malformed payloads, hidden fields, voice restrictions; 3 independent API clients; concurrent readiness; secret projections; relay-only text and audio authorization; idempotent voice and casts; path/order/gesture validation; full win and loss; pause, disconnect recovery, role locking and full-team rotation, queued-chat rate-limit recovery, rematch and leave.');
