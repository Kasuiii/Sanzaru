// Proxies the real built app without rewriting its JS, and blocks camera access.
// Start pnpm start first, then this server, and click the camera button on /lab
// and /play. A request for the stub camera proves real ONNX warm-up completed.
import {createServer} from 'node:http';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const upstream='http://127.0.0.1:8787',origin='http://127.0.0.1:8793';
const output=new URL('../docs/testing/asl-production-page.json',import.meta.url);
let reportWrites=Promise.resolve();
const report={createdAt:new Date().toISOString(),description:'Actual built /lab and /play with real Worker/runtime/model. getUserMedia is intentionally blocked after model warm-up; no physical camera is accessed.',pages:{},clientChunks:{}};
const directory=new URL('../dist/client/_next/static/chunks/',import.meta.url);
for(const file of await readdir(directory))if(file.endsWith('.js'))report.clientChunks[file]=createHash('sha256').update(await readFile(new URL(file,directory))).digest('hex');
const bootstrap=`<script>(function(){
 const result={page:location.pathname,isolated:crossOriginIsolated,workerUrls:[],modelReady:false,cameraBlocked:false,errors:[]};
 const save=()=>fetch('/__worker_probe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(result)});
 const show=text=>{let label=document.querySelector('#worker-probe');if(!label){label=document.createElement('div');label.id='worker-probe';label.style='position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#103e2c;color:white;padding:12px;text-align:center;font:14px system-ui';document.body.append(label);}label.textContent=text;};
 const NativeWorker=window.Worker;
 window.Worker=class extends NativeWorker{
  constructor(url,options){
   const resolved=new URL(url,location.href);result.workerUrls.push(resolved.href);
   if(resolved.origin!==location.origin){result.errors.push('Worker origin mismatch: '+resolved.href);void save();throw Error(result.errors.at(-1));}
   super(url,options);
   this.addEventListener('message',event=>{if(event.data.result?.health){result.modelReady=true;result.provider=event.data.result.provider;result.modelId=event.data.result.health.modelId;result.threads=event.data.result.threads;result.workerIsolated=event.data.result.isolated;void save();}});
   this.addEventListener('error',event=>{result.errors.push(event.message);void save();});
  }
 };
 navigator.mediaDevices.getUserMedia=async()=>{
  result.cameraBlocked=true;await save();
  show(result.modelReady&&result.errors.length===0?'PASS: production '+location.pathname+' loaded the same-origin Worker and real ONNX model; camera intentionally blocked.':'FAIL: camera requested before model ready');
  throw new DOMException('Camera intentionally blocked by local production test','NotAllowedError');
 };
})();</script>`;
createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,origin);
  if(url.pathname==='/__worker_probe'&&req.method==='POST'){
   if(req.headers.origin!==origin){res.writeHead(403);return res.end();}
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)throw Error('Probe too large');}
   const page=JSON.parse(raw);if(!['/lab','/play'].includes(page.page))throw Error('Unexpected test route');
   report.pages[page.page]=page;
   report.passed=['/lab','/play'].every(route=>report.pages[route]?.modelReady&&report.pages[route]?.cameraBlocked&&report.pages[route]?.workerUrls.length>0&&report.pages[route]?.errors.length===0&&report.pages[route]?.isolated&&report.pages[route]?.workerIsolated);
   const snapshot=JSON.stringify(report,null,2)+'\n';
   reportWrites=reportWrites.then(()=>writeFile(output,snapshot));
   await reportWrites;res.end('Saved');return;
  }
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(!['host','connection','content-length'].includes(key)&&typeof value==='string')headers.set(key,value);
  if(headers.get('origin')===origin)headers.set('origin',upstream);
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const response=await fetch(upstream+url.pathname+url.search,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined,redirect:'manual'});
  let body=Buffer.from(await response.arrayBuffer());
  if(response.headers.get('content-type')?.includes('text/html')&&['/lab','/play'].includes(url.pathname))body=Buffer.from(body.toString().replace('<head>','<head>'+bootstrap));
  res.statusCode=response.status;for(const [key,value]of response.headers)if(!['content-length','content-encoding','transfer-encoding','connection'].includes(key))res.setHeader(key,value);
  res.setHeader('Cache-Control','no-store');res.end(body);
 }catch(error){res.writeHead(500);res.end(String(error));}
}).listen(8793,'127.0.0.1',()=>console.log('Actual production page test (camera blocked): '+origin+'/lab and /play'));
