// Standalone browser integration test: real runtime and worker, synthetic ONNX, no camera.
// Run node tests/asl-browser-smoke.mjs, then open http://localhost:8791.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import ts from 'typescript';
await import('../scripts/prepare-onnx.mjs');
const built = process.argv.includes('--built');
const builtWorker = built ? (await readdir(new URL('../dist/client/_next/static/', import.meta.url))).find(name=>/^asl-onnx\.worker-.*\.js$/.test(name)) : null;
if (built && !builtWorker) throw new Error('Run pnpm build first');
const require = createRequire(import.meta.url);
const {onnx} = require('../node_modules/onnxruntime-web/lib/onnxjs/ort-schema/protobuf/onnx.js');
const value = (name,dims) => ({name,type:{tensorType:{elemType:1,shape:{dim:dims.map(dimValue=>({dimValue}))}}}});
// Confidence = mean(input). Verifies real pixel flow, not just a constant output.
const model = onnx.ModelProto.create({irVersion:8,opsetImport:[{domain:'',version:17}],graph:{
    name:'TEST ONLY - synthetic detector',input:[value('images',[1,3,128,128])],output:[value('output0',[1,1,6])],
    initializer:[{name:'mask',dataType:1,dims:[1,1,6],floatData:[0,0,0,0,1,0]}, {name:'base',dataType:1,dims:[1,1,6],floatData:[20,20,100,100,0,1]}],
    node:[{opType:'ReduceMean',input:['images'],output:['mean'],attribute:[{name:'keepdims',type:2,i:0}]},
        {opType:'Mul',input:['mean','mask'],output:['score']},{opType:'Add',input:['score','base'],output:['output0']}],
}});
const bytes = Buffer.from(onnx.ModelProto.encode(model).finish());
const manifest = {schema:1,model:'/fixture.onnx',sha256:createHash('sha256').update(bytes).digest('hex'),task:'detect',inputSize:128,inputName:'images',outputName:'output0',outputFormat:'end2end',labels:['Z','A','B','C','D','J'],confidence:.75,iou:.45,associationOverlap:.2};
const html = `<!doctype html><html><meta charset="utf-8"><title>ONNX browser integration</title><h1>ONNX browser integration</h1><p>Synthetic model only; no ASL accuracy or camera test.</p><button id="run">Run tests</button><pre id="output">Ready</pre><script type="module">
import {AslBrowserModel} from '/lib/asl-browser-model.ts';
const output=document.querySelector('#output');
const log=s=>output.textContent+='\\n'+s;
const assert=(test,message)=>{if(!test)throw Error(message);log('PASS '+message);};
document.querySelector('#run').onclick=async()=>{
 output.textContent='Running';document.querySelector('#run').disabled=true;
 let engine;
 try {
  let firstId;
  for(const mode of ['wasm','auto']){
   engine=new AslBrowserModel(log);
   const info=await engine.load(location.origin+'/manifest.json',mode);
   log('Provider: '+info.provider+'; fallback: '+info.fallback);
   assert(info.health.letters.includes('J')&&info.health.letters.includes('Z'),'A–Z capability mapping');
   if(firstId)assert(firstId===info.health.modelId,'same model fingerprint across providers');firstId=info.health.modelId;
   const canvas=new OffscreenCanvas(128,128),ctx=canvas.getContext('2d'),hand={x1:.1,y1:.1,x2:.9,y2:.9};
   ctx.fillStyle='white';ctx.fillRect(0,0,128,128);
   const bright=await engine.predict(await createImageBitmap(canvas),hand);
   assert(bright.letter==='A'&&bright.confidence>.99,'real '+mode+' pixel inference and class ID mapping');
   ctx.fillStyle='black';ctx.fillRect(0,0,128,128);
   const dark=await engine.predict(await createImageBitmap(canvas),hand);
   assert(dark.letter===null,'dark input rejected below threshold');
   engine.close();
  }
  engine=new AslBrowserModel(log);
  let rejected=false;try{await engine.load(location.origin+'/bad-hash.json','wasm');}catch(e){rejected=e.message.includes('SHA-256');}
  assert(rejected,'mismatched model hash rejected');engine.close();
  engine=new AslBrowserModel(log);const pending=engine.load(location.origin+'/manifest.json','wasm');engine.close();
  rejected=false;try{await pending;}catch{rejected=true;}assert(rejected,'stop cancels pending model load');
  log('ALL PASSED');
 }catch(e){log('FAILED: '+e.stack);}finally{engine?.close();document.querySelector('#run').disabled=false;}
};</script></html>`;
createServer(async(req,res)=>{
 try {
  const pathname=new URL(req.url,'http://localhost').pathname;
  res.setHeader('Cache-Control','no-store');
  if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  if(pathname==='/fixture.onnx'){res.setHeader('Content-Type','application/octet-stream');return res.end(bytes);}
  if(pathname==='/manifest.json'||pathname==='/bad-hash.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...manifest,...(pathname==='/bad-hash.json'?{sha256:'a'.repeat(64)}:{})}));}
  if(/^\/lib\/asl-[a-z.-]+(?:\.ts)?$/.test(pathname)){
   const path=pathname.endsWith('.ts')?pathname:pathname+'.ts';
   let source=await readFile(new URL('..'+path,import.meta.url),'utf8');
   if(path==='/lib/asl-browser-model.ts')source=source.replace('import workerUrl from "./asl-onnx.worker.ts?worker&url";',`const workerUrl = ${JSON.stringify(built?'/_next/static/'+builtWorker:'/lib/asl-onnx.worker.ts')};`);
   res.setHeader('Content-Type','text/javascript');return res.end(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  }
  if(built&&pathname==='/_next/static/'+builtWorker){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(new URL('../dist/client'+pathname,import.meta.url)));}
  if(/^\/onnx\/[a-zA-Z0-9/_.-]+$/.test(pathname)&&!pathname.includes('..')){
   res.setHeader('Content-Type',pathname.endsWith('.mjs')?'text/javascript':pathname.endsWith('.json')?'application/json':'application/octet-stream');
   return res.end(await readFile(new URL((built?'../dist/client':'../public')+pathname,import.meta.url)));
  }
  res.writeHead(404);res.end('Not found');
 }catch(e){res.writeHead(500);res.end(String(e));}
}).listen(8791,'127.0.0.1',()=>console.log('Browser integration: http://localhost:8791 (synthetic model, no camera; built='+built+')'));
