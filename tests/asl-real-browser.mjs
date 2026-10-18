// Real YOLO26 browser validation. Run the Python validator and pnpm build first.
// Serves only allowlisted local fixtures; never included in production assets.
import {createServer} from 'node:http';
import {readFile, writeFile, readdir} from 'node:fs/promises';
import ts from 'typescript';
const root = new URL('../', import.meta.url);
const report = JSON.parse(await readFile(new URL('docs/testing/asl-model-validation.json', root)));
const manifest = JSON.parse(await readFile(new URL('dist/client/models/asl/manifest.json', root)));
if (report.modelSha256 !== manifest.sha256) throw Error('Build and validation report must use the same model');
const worker = (await readdir(new URL('dist/client/_next/static/', root))).find(name => /^asl-onnx\.worker-.*\.js$/.test(name));
if (!worker) throw Error('Run pnpm build first');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Real ASL ONNX validation</title>
<style>body{background:#101b26;color:#e0f5ef;font:16px system-ui;margin:32px;max-width:1100px}button{padding:12px 24px}pre{white-space:pre-wrap;line-height:1.5}</style>
<h1>YOLO26n ASL · Production Worker validation</h1><p>Real model, ${report.tested} deterministic test images, annotation hand regions. No camera or MediaPipe. Not a full accuracy evaluation.</p>
<button id="run">Run real model tests</button><pre id="output">Ready</pre><script type="module">
import {AslBrowserModel} from '/client.js';
const output=document.querySelector('#output'),button=document.querySelector('#run');
const log=text=>output.textContent+='\\n'+text;
button.onclick=async()=>{
 button.disabled=true;output.textContent='Running';
 let engine;const result={modelSha256:${JSON.stringify(manifest.sha256)},manifest:${JSON.stringify(manifest)},isolated:crossOriginIsolated,userAgent:navigator.userAgent,createdAt:new Date().toISOString(),runs:[]};
 try {
  const reference=await (await fetch('/reference.json')).json();let fingerprint;
  for(const mode of (crossOriginIsolated?['wasm','auto']:['wasm'])){
   engine=new AslBrowserModel(log);const loaded=performance.now();
   const info=await engine.load(location.origin+'/reference-manifest.json',mode);
   const run={mode,provider:info.provider,threads:info.threads,fallback:info.fallback,loadMs:performance.now()-loaded,modelId:info.health.modelId,samples:[]};
   result.runs.push(run);log('Provider: '+mode+' → '+info.provider+'; fallback='+info.fallback);
   if(fingerprint&&fingerprint!==info.health.modelId)throw Error('Different provider fingerprints');fingerprint=info.health.modelId;
   for(const sample of reference.samples){
    const image=await createImageBitmap(await (await fetch('/prepared/'+sample.prepared)).blob());
    const start=performance.now(),prediction=await engine.predict(image,sample.preparedHand),ms=performance.now()-start;
    const parity=prediction.letter===sample.letter&&Math.abs(prediction.confidence-sample.confidence)<=.0002;
    run.samples.push({file:sample.file,...prediction,ms,parity,expected:sample.expected});
   }
   const times=run.samples.map(s=>s.ms).sort((a,b)=>a-b);
   run.passed=run.samples.filter(s=>s.parity).length;run.p50Ms=times[Math.floor(times.length*.5)];run.p95Ms=times[Math.ceil(times.length*.95)-1];run.maxMs=times.at(-1);
   log('Prepared pixel parity: '+run.passed+'/'+run.samples.length+'; p50 '+run.p50Ms.toFixed(0)+' ms; p95 '+run.p95Ms.toFixed(0)+' ms; max '+run.maxMs.toFixed(0)+' ms');
   // Also exercise JPEG decoding and resizing of the original dataset images.
   engine.close(); engine=new AslBrowserModel(log);
   const actual=await engine.load(location.origin+'/models/asl/manifest.json',mode);
   run.productionModelId=actual.health.modelId;
   run.originals=[];
   for(const sample of reference.samples.filter((_,index)=>index%2===0)){
    const frame=await createImageBitmap(await (await fetch('/original/'+encodeURIComponent(sample.file))).blob());
    const start=performance.now(),prediction=await engine.predict(frame,sample.hand);
    run.originals.push({file:sample.file,...prediction,ms:performance.now()-start,expected:sample.expected,referenceLetter:sample.letter});
   }
   run.originalAgreement=run.originals.filter(s=>s.letter===s.referenceLetter).length;
   log('Original JPEG class agreement with CPU reference: '+run.originalAgreement+'/'+run.originals.length+' (browser interpolation may differ)');
   engine.close();
   if(run.passed!==run.samples.length)throw Error('Prepared tensor parity failed');
  }
  result.passed=true;log('ALL PASSED');
 }catch(error){result.passed=false;result.error=String(error.stack);log('FAILED '+error.stack);}
 finally{engine?.close();await fetch('/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});button.disabled=false;}
};</script></html>`;
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1'),path=url.pathname;res.setHeader('Cache-Control','no-store');
  if(!url.searchParams.has('single')){res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');}
  if(path==='/results'&&req.method==='POST'){
   if(req.headers.origin!=='http://127.0.0.1:8792') {res.writeHead(403);return res.end();}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>500000)throw Error('Report too large');}
   const result=JSON.parse(body);if(result.modelSha256!==manifest.sha256)throw Error('Wrong model report');
   await writeFile(new URL('docs/testing/'+(result.isolated?'asl-browser-validation.json':'asl-browser-single-thread.json'),root),JSON.stringify(result,null,2)+'\n');
   return res.end('Saved');
  }
  if(path==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  if(path==='/reference.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(report));}
  if(path==='/reference-manifest.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...manifest,model:'/models/asl/'+manifest.model,inputMode:'full-frame',mirror:false}));}
  if(path==='/client.js'){
   const source=(await readFile(new URL('lib/asl-browser-model.ts',root),'utf8')).replace('import workerUrl from "./asl-onnx.worker.ts?worker&url";',`const workerUrl = ${JSON.stringify('/_next/static/'+worker)};`);
   res.setHeader('Content-Type','text/javascript');return res.end(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  }
  let target;
  if(path.startsWith('/prepared/')&&report.samples.some(s=>path==='/prepared/'+s.prepared))target=new URL('.sites-runtime/asl-validation/'+path.split('/').at(-1),root);
  if(path.startsWith('/original/')&&report.samples.some(s=>path==='/original/'+s.file))target=new URL('ASL.v2-aslv2.yolo26/test/images/'+path.split('/').at(-1),root);
  if(path==='/_next/static/'+worker||path==='/models/asl/manifest.json'||path==='/models/asl/'+manifest.model||(/^\/onnx\/[a-zA-Z0-9/_.-]+$/.test(path)&&!path.includes('..')))target=new URL('dist/client'+path,root);
  if(target){res.setHeader('Content-Type',/\.(mjs|js)$/.test(path)?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.png')?'image/png':path.endsWith('.jpg')?'image/jpeg':'application/octet-stream');return res.end(await readFile(target));}
  res.writeHead(404);res.end('Not found');
 }catch(error){res.writeHead(500);res.end(String(error));}
}).listen(8792,'127.0.0.1',()=>console.log('Real ASL validation: http://127.0.0.1:8792'));
