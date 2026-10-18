// Built Cloudflare Worker + real local D1/R2. Uses synthetic audio, no microphone.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const base='http://127.0.0.1:8787';
const clients=['iwazaru','kikazaru','mizaru'].map(role=>({role,token:randomBytes(32).toString('hex')}));
const [iw,ki,mi]=clients;let code;
async function call(client,body,status=200){
 const response=await fetch(base+'/api/asl',{method:'POST',headers:{'Content-Type':'application/json',Origin:base,Authorization:'Bearer '+client.token},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data.room;
}
const sync=client=>call(client,{op:'sync',code});
const action=(client,type,values={})=>call(client,{op:'action',code,action:{id:randomUUID(),type,...values}});
try{
 for(const route of ['/','/lab','/play','/chronicle','/workshop','/vision/gesture_recognizer.task']){
  const response=await fetch(base+route);assert.equal(response.status,200,route);assert((await response.arrayBuffer()).byteLength>0);
 }
 const manifestResponse=await fetch(base+'/models/asl/manifest.json');assert.equal(manifestResponse.status,200);
 const manifest=await manifestResponse.json();
 const modelResponse=await fetch(base+'/models/asl/'+manifest.model);assert.equal(modelResponse.status,200);
 assert.equal(createHash('sha256').update(new Uint8Array(await modelResponse.arrayBuffer())).digest('hex'),manifest.sha256);
 code=(await call(iw,{op:'create',name:'Local Iw',role:iw.role,mode:'practice'})).code;
 for(const client of [ki,mi])await call(client,{op:'join',code,name:'Local '+client.role,role:client.role});
 await Promise.all(clients.map(client=>action(client,'ready',{ready:true})));
 assert.equal((await action(iw,'start')).phase,'playing');
 for(let stage=0;stage<5;stage++){
  const room=await sync(iw),challenge=room.challenge,target=room.target;
  assert.equal(room.stage,stage);assert(!('target'in await sync(ki)));assert(!('target'in await sync(mi)));
  await action(ki,'request',{challenge});const sourceId=randomUUID();
  await action(iw,'sign',{id:sourceId,challenge,letter:target,source:'practice'});
  assert.equal((await sync(ki)).signal.letter,target);
  if(stage===0){
   const id=randomUUID(),form=new FormData();
   form.set('code',code);form.set('id',id);form.set('challenge',challenge);form.set('sourceId',sourceId);
   form.set('audio',new Blob([new Uint8Array(250)],{type:'audio/webm'}),'local-test.webm');
   const uploaded=await fetch(base+'/api/asl/voice',{method:'POST',headers:{Origin:base,Authorization:'Bearer '+ki.token},body:form});
   assert.equal(uploaded.status,200,await uploaded.text());
   for(const [client,status] of [[mi,200],[iw,403]]){
    const voice=await fetch(base+'/api/asl/voice?'+new URLSearchParams({code,id}),{headers:{Authorization:'Bearer '+client.token}});
    assert.equal(voice.status,status);if(status===200)assert.equal((await voice.arrayBuffer()).byteLength,250);
   }
  }else await action(ki,'relay',{challenge,sourceId});
  await action(mi,'answer',{challenge,letter:target,source:'practice'});
 }
 for(const client of clients){const room=await sync(client);assert.equal(room.phase,'won');assert.equal(room.results.length,5);}
 console.log('PASS: built pages/model hash, local D1, three roles, hidden targets, five seals, R2 audio bytes and role permissions. No camera/microphone accuracy implied.');
}finally{
 if(code)for(const client of clients)await action(client,'leave');
}
