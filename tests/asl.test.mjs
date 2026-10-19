// Exercise real HTTP handlers, room store and engine with in-memory D1/R2 adapters.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import ts from 'typescript';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(':memory:'),blobs=new Map(),defer=()=>new Promise(r=>setImmediate(r));
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
globalThis.__aslTestEnv={DB:{prepare(sql){return{bind(...args){return{
  async first(){await defer();return db.prepare(sql).get(...args)||null;},
  async all(){await defer();return{results:db.prepare(sql).all(...args)};},
  async run(){await defer();return{meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}
};}};}},BUCKET:{
  async put(key,bytes,options){blobs.set(key,{bytes:new Uint8Array(bytes),mime:options.httpMetadata.contentType});},
  async get(key){const b=blobs.get(key);return b?{body:b.bytes,httpMetadata:{contentType:b.mime}}:null;},
  async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])blobs.delete(key);},
  async list({prefix}){return{objects:[...blobs.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
}};
const moduleUrl=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compile=p=>ts.transpileModule(fs.readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const shared=moduleUrl(compile('../lib/asl-shared.ts'));
const engine=moduleUrl(compile('../lib/asl-engine.ts').replace('"./asl-shared"',JSON.stringify(shared)));
const http=moduleUrl(compile('../lib/asl-http.ts').replace('"./asl-engine"',JSON.stringify(engine)));
const store=moduleUrl(compile('../lib/asl-store.ts').replace('import { env } from "cloudflare:workers";','const env=globalThis.__aslTestEnv;').replace('"./asl-shared"',JSON.stringify(shared)).replace('"./asl-engine"',JSON.stringify(engine)));
const route=p=>moduleUrl(compile(p).replace('"@/lib/asl-store"',JSON.stringify(store)).replace('"@/lib/asl-engine"',JSON.stringify(engine)).replace('"@/lib/asl-http"',JSON.stringify(http)));
const {POST}=await import(route('../app/api/asl/route.ts'));
const {POST:voicePOST,GET:voiceGET}=await import(route('../app/api/asl/voice/route.ts'));
const base='https://asl-test.invalid',token=()=>randomBytes(32).toString('hex'),iw=token(),ki=token(),mi=token(),stranger=token();let code;
async function request(t,b,status=200){const r=await POST(new Request(base+'/api/asl',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t,Origin:base},body:JSON.stringify(b)}));const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));assert.equal(r.headers.get('Cache-Control'),'no-store');return d.room||d;}
const sync=t=>request(t,{op:'sync',code});
const action=(t,type,values={},status=200)=>request(t,{op:'action',code,action:{id:randomUUID(),type,...values}},status);
const create=await request(iw,{op:'create',name:'Iw',role:'iwazaru',mode:'practice'});code=create.code;
assert.equal((await request(iw,{op:'create',name:'Iw',role:'iwazaru',mode:'practice'})).code,code,'create is idempotent');
await request(stranger,{op:'sync',code},401);
await request('',{op:'sync',code},401);
await request(ki,{op:'join',code,name:'Ki',role:'kikazaru'});
await request(mi,{op:'join',code,name:'Mi',role:'mizaru'});
await request(stranger,{op:'join',code,name:'Fourth',role:'mizaru'},409);
await action(ki,'settings',{mode:'practice',letters:['A','B','C','L','Y']},403);
await action(iw,'settings',{mode:'practice',letters:['A','B','C','?','Y']},400);
await action(iw,'start',{},409);
await action(iw,'role',{role:'kikazaru'},409);
await Promise.all([iw,ki,mi].map(t=>action(t,'ready',{ready:true})));
assert((await sync(iw)).players.every(p=>p.ready),'CAS preserves concurrent readiness');
let room=await action(iw,'start');assert.equal(room.phase,'playing');
for(const t of [iw,ki,mi]){
  const view=await sync(t);assert(!('targets' in view));assert(!('results' in view));assert(!JSON.stringify(view).includes(t));assert(view.players.every(p=>!('key'in p)&&!('modelId'in p)));
  if(t!==iw)assert(!('target'in view),'only Iwazaru receives target');
}
await action(iw,'settings',{mode:'ai',letters:['A','B','C','L','Y']},409);
await action(iw,'sign',{challenge:room.challenge,letter:room.target,source:'practice'},409);
await action(mi,'answer',{challenge:room.challenge,letter:room.target,source:'practice'},409);
await action(mi,'request',{challenge:room.challenge},403);
await action(ki,'request',{challenge:'outdated'},409);
let voiceId,firstChallenge,answers=0;
for(let stage=0;stage<5;stage++){
  room=await sync(iw);const challenge=room.challenge,target=room.target;assert.equal(room.stage,stage);
  const k=await sync(ki),m=await sync(mi);assert(!('target'in k)&&!('target'in m)&&!('signal'in m));assert.equal(m.hasRelay,false);
  await action(mi,'ask',{challenge});await action(ki,'request',{challenge});
  const signalId=randomUUID();await action(iw,'sign',{id:signalId,challenge,letter:target,source:'practice'});
  assert.equal((await sync(ki)).signal.letter,target);assert(!('relay'in(await sync(ki))));
  if(stage===0){
    firstChallenge=challenge;
    async function upload(t,id=voiceId,sourceId=signalId,expected=200){const form=new FormData();form.set('code',code);form.set('id',id);form.set('challenge',challenge);form.set('sourceId',sourceId);form.set('audio',new Blob([new Uint8Array(250)],{type:'audio/webm'}),'voice.webm');const response=await voicePOST(new Request(base+'/api/asl/voice',{method:'POST',headers:{Authorization:'Bearer '+t,Origin:base},body:form}));assert.equal(response.status,expected,await response.text());}
    voiceId=randomUUID();await upload(iw,randomUUID(),signalId,403);await upload(ki,voiceId,signalId);await upload(ki,voiceId,signalId);assert.equal(blobs.size,1,'retry keeps one voice object');
    for(const [t,status] of [[mi,200],[iw,403],[ki,403],[stranger,403]]){const response=await voiceGET(new Request(base+'/api/asl/voice?code='+code+'&id='+voiceId,{headers:{Authorization:'Bearer '+t}}));assert.equal(response.status,status);if(status===200){assert.equal((await response.arrayBuffer()).byteLength,250);assert.equal(response.headers.get('Content-Type'),'audio/webm');}}
    const other=target==='A'?'B':'A';await action(mi,'answer',{challenge,letter:other,source:'practice'});answers++;assert.equal((await sync(mi)).stage,0);assert.equal((await sync(mi)).feedback.correct,false);
    await action(mi,'pause');const paused=await sync(ki);assert.equal(paused.phase,'paused');assert(!('target'in paused));await action(mi,'answer',{challenge,letter:target,source:'practice'},409);await action(ki,'resume');
  }else{
    await action(ki,'relay',{challenge,sourceId:randomUUID()},409);
    await action(ki,'relay',{challenge,sourceId:signalId});
  }
  const answerId=randomUUID();await action(mi,'answer',{id:answerId,challenge,letter:target,source:'practice'});answers++;
  const duplicate=await action(mi,'answer',{id:answerId,challenge,letter:target,source:'practice'});assert.equal(duplicate.stage,stage+1,'duplicate submission cannot advance twice');
  if(stage<4)await action(mi,'answer',{challenge,letter:target,source:'practice'},409);
}
for(const t of [iw,ki,mi]){const won=await sync(t);assert.equal(won.phase,'won');assert.equal(won.results.length,5);assert.equal(won.totalAttempts,answers);assert.equal(new Set(won.results.map(r=>r.target)).size,5);assert.equal(won.results[0].attempts,2);assert(!('target'in won));}
assert.equal((await voiceGET(new Request(base+'/api/asl/voice?code='+code+'&id='+voiceId,{headers:{Authorization:'Bearer '+mi}}))).status,403);
await action(iw,'rematch');await action(iw,'rotate');assert.equal((await sync(iw)).role,'kikazaru');assert.equal((await sync(ki)).role,'mizaru');assert.equal((await sync(mi)).role,'iwazaru');
assert.equal((await sync(ki)).phase,'lobby');assert(!('results'in(await sync(ki))));
// Switch to actual-model mode: both signers must advertise the same model fingerprint.
await action(iw,'settings',{mode:'ai',letters:['A','B','C','L','Y']});const caps=['A','B','C','L','Y'],modelId='a'.repeat(64);
await action(ki,'ready',{ready:true,capabilities:['A'],modelId},409);
await action(iw,'ready',{ready:true});await action(ki,'ready',{ready:true,capabilities:caps,modelId});await action(mi,'ready',{ready:true,capabilities:caps,modelId:'b'.repeat(64)});await action(iw,'start',{},409);
await action(mi,'ready',{ready:true,capabilities:caps,modelId});await action(iw,'start');room=await sync(mi);await action(iw,'request',{challenge:room.challenge});
room=await sync(mi);
const valid={challenge:room.challenge,requestId:room.requestId,letter:room.target,source:'ai',modelId,confidence:.95,heldMs:3000,sampleAgeMs:100};
for(const bad of [{source:'practice'},{confidence:.499},{heldMs:0},{sampleAgeMs:1600},{letter:'J'},{letter:'Z'},{modelId:'b'.repeat(64)}])await action(mi,'sign',{...valid,...bad},bad.source||bad.modelId?409:400);
for(const bad of [{confidence:.9},{heldMs:2999},{requestId:randomUUID()}])await action(mi,'sign',{...valid,...bad},bad.requestId?409:400);
const signedId=randomUUID();await action(mi,'sign',{...valid,id:signedId});
await action(mi,'sign',{...valid,id:signedId}); // Same network retry is idempotent.
await action(mi,'sign',valid,409); // A new command cannot overwrite this request.
const firstSignal=(await sync(iw)).signal;
await action(iw,'relay',{challenge:room.challenge,sourceId:firstSignal.id});
await action(iw,'request',{challenge:room.challenge});
const requestedAgain=await sync(mi);assert.equal(requestedAgain.hasSignal,false);assert.equal(requestedAgain.hasRelay,false);
await action(mi,'sign',valid,409,'old request cannot race a newer request');
await action(mi,'sign',{...valid,requestId:requestedAgain.requestId});const signal=(await sync(iw)).signal;
await action(iw,'relay',{challenge:room.challenge,sourceId:signal.id});await action(ki,'answer',{...valid,confidence:.5,heldMs:1000});assert.equal((await sync(ki)).stage,1);
await action(mi,'leave');assert.equal((await sync(iw)).phase,'paused');await action(iw,'resume',{},409);await action(iw,'rematch');await request(stranger,{op:'join',code,name:'Replacement',role:'iwazaru'});assert.equal((await sync(iw)).players.length,3);
// Boundary checks bypass helper to preserve invalid raw requests.
const cross=await POST(new Request(base+'/api/asl',{method:'POST',headers:{Origin:'https://other.invalid'},body:'{}'}));assert.equal(cross.status,403);
const large=await POST(new Request(base+'/api/asl',{method:'POST',body:'x'.repeat(12001)}));assert.equal(large.status,413);
const invalid=await POST(new Request(base+'/api/asl',{method:'POST',body:'{'}));assert.equal(invalid.status,400);
const badForm=await voicePOST(new Request(base+'/api/asl/voice',{method:'POST',body:'invalid'}));assert.equal(badForm.status,400);
db.prepare('UPDATE asl_rooms SET expires_at=0 WHERE code=?').run(code);await request(iw,{op:'sync',code},404);
await request(token(),{op:'create',name:'Cleanup',mode:'practice'});assert.equal(blobs.size,0,'expired-room cleanup removes stored voice');
// Browser models can advertise J/Z as image classes; exercise both through the real room API.
code=(await request(iw,{op:'create',name:'Iw',role:'iwazaru',mode:'ai'})).code;
await request(ki,{op:'join',code,name:'Ki',role:'kikazaru'});
await request(mi,{op:'join',code,name:'Mi',role:'mizaru'});
const alphabetWithMotionClasses=['A','B','C','J','Z'];
await action(iw,'settings',{mode:'ai',letters:alphabetWithMotionClasses});
await action(iw,'ready',{ready:true,capabilities:alphabetWithMotionClasses,modelId});
await action(ki,'ready',{ready:true});
await action(mi,'ready',{ready:true,capabilities:alphabetWithMotionClasses,modelId});
await action(iw,'start');
for(let stage=0;stage<5;stage++){
  const r=await sync(iw),evidence={challenge:r.challenge,letter:r.target,source:'ai',modelId,confidence:.95,heldMs:3000,sampleAgeMs:100};
  await action(ki,'request',{challenge:r.challenge});
  await action(iw,'sign',{...evidence,requestId:(await sync(iw)).requestId});
  await action(ki,'relay',{challenge:r.challenge,sourceId:(await sync(ki)).signal.id});
  await action(mi,'answer',evidence);
}
assert.equal((await sync(mi)).phase,'won');
assert.deepEqual((await sync(mi)).results.map(r=>r.answer).sort(),alphabetWithMotionClasses);
console.log('PASS: three clients, five seals, D1 concurrency, private projections, role permissions, voice R2 permissions/retry, pause, replay protection, rematch, model agreement, AI/practice separation, expiry and request bounds.');
