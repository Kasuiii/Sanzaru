// Actual built UI + actual MediaPipe/ONNX with a canvas video of a local fixture.
// No camera permission, fake model results, or production account access.
import {createServer} from 'node:http';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),upstream='http://127.0.0.1:8787',origin='http://127.0.0.1:8794';
const pipeline=JSON.parse(await readFile(new URL('docs/testing/asl-pipeline-validation.json',root)));
const fixture=pipeline.samples.filter(s=>s.letter===s.expected&&s.confidence>.9).sort((a,b)=>b.confidence-a.confidence)[0];
if(!fixture)throw Error('Run the full pipeline benchmark first; need a real high-confidence fixture.');
const manifest=JSON.parse(await readFile(new URL('public/models/asl/manifest.json',root)));
const chunks={};const chunkDir=new URL('dist/client/_next/static/chunks/',root);
for(const file of await readdir(chunkDir))if(file.endsWith('.js'))chunks[file]=createHash('sha256').update(await readFile(new URL(file,chunkDir))).digest('hex');
let session,signs=[];
async function api(client,body){
 const r=await fetch(upstream+'/api/asl',{method:'POST',headers:{Origin:upstream,'Content-Type':'application/json',Authorization:'Bearer '+client.token},body:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error(data.error);return data.room;
}
const act=(role,type,values={})=>api(session.clients[role],{op:'action',code:session.code,action:{type,id:randomUUID(),...values}});
async function cleanup(){if(session){for(const role of Object.keys(session.clients))await act(role,'leave');session=null;}}
async function setup(){
 await cleanup();signs=[];
 const clients=Object.fromEntries(['iwazaru','kikazaru','mizaru'].map(role=>[role,{token:randomBytes(32).toString('hex')}]));
 const room=await api(clients.iwazaru,{op:'create',name:'ทดสอบส่งอัตโนมัติ',role:'iwazaru',mode:'ai'});
 session={code:room.code,clients};
 for(const role of ['kikazaru','mizaru'])await api(clients[role],{op:'join',code:room.code,name:'Test '+role,role});
 for(const role of Object.keys(clients))await act(role,'ready',{ready:true,capabilities:manifest.labels.filter(Boolean),modelId:pipeline.modelId});
 await act('iwazaru','start');return {code:room.code,token:clients.iwazaru.token,fixtureLetter:fixture.letter};
}
function bootstrap(config){
 sessionStorage.setItem('sanzaru-asl-session-v1',JSON.stringify({code:config.code,token:config.token}));
 let canvas,ctx,picture,showHand=true,predictions=0,lastPrediction=null;
 const nativeWorker=window.Worker;
 window.Worker=class extends nativeWorker{constructor(...args){super(...args);this.addEventListener('message',e=>{if(e.data.result&&'letter'in e.data.result){predictions++;lastPrediction=e.data.result;}});}};
 navigator.mediaDevices.getUserMedia=async()=>{
  picture=await createImageBitmap(await(await fetch('/fixture.jpg')).blob());
  canvas=document.createElement('canvas');canvas.width=picture.width;canvas.height=picture.height;ctx=canvas.getContext('2d');
  const draw=()=>{ctx.fillStyle='#727272';ctx.fillRect(0,0,canvas.width,canvas.height);if(showHand)ctx.drawImage(picture,0,0);};
  draw();const stream=canvas.captureStream(30),timer=setInterval(draw,33);
  stream.getVideoTracks()[0].addEventListener('ended',()=>clearInterval(timer));return stream;
 };
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const call=async(op)=>{const r=await fetch('/test-control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op})});const data=await r.json();if(!r.ok)throw Error(data.error);return data;};
 async function until(fn,limit=25000){const started=Date.now();while(Date.now()-started<limit){const value=await fn();if(value)return value;await delay(200);}throw Error('Timed out waiting for real camera/model/game state');}
 addEventListener('DOMContentLoaded',()=>{
  const panel=document.createElement('section');panel.style='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#103e2c;color:white;padding:12px;font:14px system-ui;max-height:32vh;overflow:auto';
  panel.innerHTML='<strong>LOCAL TEST: real models, synthetic camera video</strong> <button id="run-auto">Run automatic-send scenarios</button><pre id="auto-log">Open the game camera first. No physical camera is accessed.</pre>';
  document.body.append(panel);const log=t=>panel.querySelector('pre').textContent+='\n'+t;
  panel.querySelector('button').onclick=async()=>{
   panel.querySelector('button').disabled=true;const report={createdAt:new Date().toISOString(),description:'Actual production game, real MediaPipe and ONNX. Canvas video repeats a real held-out image; no physical webcam, no injected predictions.',fixtureLetter:config.fixtureLetter,checks:[]};
   const check=(name,value)=>{report.checks.push({name,passed:!!value});if(!value)throw Error(name);log('PASS '+name);};
   try{
    await until(()=>predictions>=3&&lastPrediction?.letter===config.fixtureLetter&&lastPrediction.confidence>.9);
    check('real high-confidence model predictions are arriving',true);
    showHand=false;await delay(700);await call('request');await delay(3400);
    check('no hand for more than 3 seconds sends nothing',!(await call('status')).hasSignal);
    showHand=true;await delay(1500);showHand=false;await delay(700);
    check('an interrupted hold sends nothing',!(await call('status')).hasSignal);
    let resumed=Date.now();showHand=true;
    let room=await until(async()=>{const r=await call('status');return r.hasSignal?r:null;});
    check('fresh continuous hold auto-sends after at least 3 seconds',Date.now()-resumed>=3000);
    check('Kikazaru receives the actual predicted letter',room.signal.letter===config.fixtureLetter);
    let signalId=room.signal.id;await delay(4000);
    check('keeping the same hand up does not resend', (await call('status')).signal.id===signalId);
    await call('request');resumed=Date.now();
    room=await until(async()=>{const r=await call('status');return r.hasSignal?r:null;});
    check('a new request permits the same letter after a new 3-second hold',room.signal.id!==signalId&&Date.now()-resumed>=3000);
    await call('request');await delay(1000);await call('pause');await delay(3400);
    check('paused game sends nothing',!(await call('status')).hasSignal);
    await call('resume');resumed=Date.now();
    room=await until(async()=>{const r=await call('status');return r.hasSignal?r:null;});
    check('resume requires a fresh 3-second hold',Date.now()-resumed>=3000);
    const receiver=await call('receiver');check('Mizaru cannot see the source letter',!('signal'in receiver)&&!('target'in receiver));
    report.passed=true;log('ALL PASSED — real auto-send reached Kikazaru without pressing Send.');
   }catch(error){report.passed=false;report.error=String(error.stack);log('FAIL '+error.message);}
   finally{report.predictions=predictions;await fetch('/test-results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});panel.querySelector('button').disabled=false;}
  };
 });
}
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/fixture.jpg'){res.setHeader('Content-Type','image/jpeg');return res.end(await readFile(new URL('ASL.v2-aslv2.yolo26/test/images/'+fixture.file,root)));}
  const buffers=[];for await(const chunk of req)buffers.push(chunk);const raw=Buffer.concat(buffers);
  if(['/test-control','/test-results'].includes(url.pathname)){
   if(req.method!=='POST'||req.headers.origin!==origin){res.writeHead(403);return res.end();}
   const data=JSON.parse(raw);res.setHeader('Content-Type','application/json');
   if(url.pathname==='/test-results'){
    const report={...data,fixture:fixture.file,modelSha256:manifest.sha256,clientChunks:chunks,signs};
    report.passed=report.passed&&signs.length===3&&signs.every(s=>s.confidence>.9&&s.heldMs>=3000&&s.status===200);
    await writeFile(new URL('docs/testing/asl-auto-send-browser.json',root),JSON.stringify(report,null,2)+'\n');return res.end(JSON.stringify({saved:true,passed:report.passed}));
   }
   if(data.op==='cleanup'){await cleanup();return res.end('{}');}
   // Keep all three local test participants present during the long hold/pause scenarios.
   const [,room]=await Promise.all(Object.values(session.clients).map(client=>api(client,{op:'sync',code:session.code})));
   if(data.op==='status')return res.end(JSON.stringify(room));
   if(data.op==='receiver')return res.end(JSON.stringify(await api(session.clients.mizaru,{op:'sync',code:session.code})));
   if(!['request','pause','resume'].includes(data.op))throw Error('Unknown test operation');
   return res.end(JSON.stringify(await act('kikazaru',data.op,{challenge:room.challenge})));
  }
  const headers=new Headers();for(const[key,value]of Object.entries(req.headers))if(!['host','connection','content-length'].includes(key)&&typeof value==='string')headers.set(key,value);
  if(headers.get('origin')===origin)headers.set('origin',upstream);
  const response=await fetch(upstream+url.pathname+url.search,{method:req.method,headers,body:raw.length?raw:undefined,redirect:'manual'});
  if(url.pathname==='/api/asl'&&req.method==='POST'){const action=JSON.parse(raw).action;if(action?.type==='sign')signs.push({letter:action.letter,confidence:action.confidence,heldMs:action.heldMs,sampleAgeMs:action.sampleAgeMs,requestId:action.requestId,status:response.status});}
  let body=Buffer.from(await response.arrayBuffer());
  if(url.pathname==='/play'&&response.headers.get('content-type')?.includes('text/html')){const config=await setup();body=Buffer.from(body.toString().replace('<head>','<head><script>('+bootstrap.toString()+')('+JSON.stringify(config)+');</script>'));}
  res.statusCode=response.status;for(const[key,value]of response.headers)if(!['content-length','content-encoding','transfer-encoding','connection'].includes(key))res.setHeader(key,value);
  res.end(body);
 }catch(error){res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:String(error)}));}
}).listen(8794,'127.0.0.1',()=>console.log('Real auto-send test: '+origin+'/play'));
