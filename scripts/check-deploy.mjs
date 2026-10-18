// Read-only checks for the production bundle. No Cloudflare account access.
import {readFile, readdir, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {checkBrowserWorkerUrls} from './check-worker-urls.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const assetRoot=path.join(root,'dist/client');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
async function files(directory){
 const list=[];
 for(const item of await readdir(directory,{withFileTypes:true})){
  const absolute=path.join(directory,item.name);
  assert(!item.isSymbolicLink(),'Symlinks are not allowed in deployment assets: '+absolute);
  if(item.isDirectory())list.push(...await files(absolute));else if(item.isFile())list.push(absolute);
 }
 return list;
}
const assets=await files(assetRoot);
assert(assets.length<=20000,'Too many assets for the Cloudflare free-plan limit');
for(const file of assets)assert((await stat(file)).size<=25*1024*1024,'Asset exceeds 25 MiB: '+file);
const modelDir=path.join(assetRoot,'models/asl');
const manifest=await readJson(path.join(modelDir,'manifest.json'));
assert(/^asl-[a-f0-9]{16}\.onnx$/.test(manifest.model),'Release requires the local hashed model');
assert(sha(await readFile(path.join(modelDir,manifest.model)))===manifest.sha256,'Built model SHA-256 mismatch');
const sourceManifest=await readJson(path.join(root,'public/models/asl/manifest.json'));
assert(JSON.stringify(manifest)===JSON.stringify(sourceManifest),'Built manifest is stale; run pnpm build');
const headers=await readFile(path.join(assetRoot,'_headers'),'utf8');
assert(headers.includes('Cross-Origin-Opener-Policy: same-origin')&&headers.includes('Cross-Origin-Embedder-Policy: require-corp'),'Missing isolation headers for multi-threaded WASM');
const validation=await readJson(path.join(root,'docs/testing/asl-model-validation.json'));
assert(validation.modelSha256===manifest.sha256&&validation.tested>0&&validation.parityPassed===validation.tested,'Model needs a passing checkpoint/ONNX validation report');
assert(JSON.stringify(validation.manifest)===JSON.stringify(manifest),'Revalidate the current preprocessing/threshold configuration');
const detailManifest=await readJson(path.join(modelDir,'manifest-640.json'));
const detailValidation=await readJson(path.join(root,'docs/testing/asl-model-validation-640.json'));
assert(sha(await readFile(path.join(modelDir,detailManifest.model)))===detailManifest.sha256,'640 model SHA-256 mismatch');
assert(JSON.stringify(detailValidation.manifest)===JSON.stringify(detailManifest)&&detailValidation.parityPassed===detailValidation.tested,'640 profile needs a matching parity report');
const runtime=await readJson(path.join(assetRoot,'onnx/runtime.json'));
const packageJson=await readJson(path.join(root,'package.json'));
assert(runtime.version===packageJson.dependencies['onnxruntime-web'],'Runtime package version mismatch');
assert(runtime.base===`/onnx/${runtime.version}/`,'Invalid runtime base');
assert(runtime.parts.every(part=>/^runtime-\d+\.bin$/.test(part)),'Invalid WASM parts');
const runtimeDir=path.join(assetRoot,runtime.base);
const parts=await Promise.all(runtime.parts.map(part=>readFile(path.join(runtimeDir,part))));
assert(sha(Buffer.concat(parts))===runtime.sha256,'WASM SHA-256 mismatch');
for(const file of [runtime.entry,runtime.module,'LICENSE.txt'])assert((await stat(path.join(runtimeDir,file))).size>0,'Missing runtime '+file);
for(const file of ['vision/gesture_recognizer.task','vision/vision_wasm_internal.wasm'])assert((await stat(path.join(assetRoot,file))).size>0,'Missing '+file);
assert(assets.some(file=>/asl-onnx\.worker-[^/\\]+\.js$/.test(file)),'Missing compiled model Worker');
await checkBrowserWorkerUrls(assetRoot);
assert((await stat(path.join(root,'dist/server/index.js'))).size>0,'Missing built server');
assert((await stat(path.join(root,'drizzle/0002_asl_hand_to_heart.sql'))).size>0,'Missing ASL database migration');
const configIndex=process.argv.indexOf('--config');
if(configIndex>=0){
 assert(process.argv[configIndex+1],'Supply --config path');
 const configFile=path.resolve(root,process.argv[configIndex+1]);
 const parsed=ts.parseConfigFileTextToJson(configFile,await readFile(configFile,'utf8'));
 assert(!parsed.error,'Invalid JSONC deployment configuration');
 const config=parsed.config;
 const db=config.d1_databases?.find(d=>d.binding==='DB'),bucket=config.r2_buckets?.find(b=>b.binding==='BUCKET');
 assert(db&&/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(db.database_id)&&!db.database_id.startsWith('00000000-'),'Set your real D1 database_id');
 assert(bucket&&bucket.bucket_name&&!bucket.bucket_name.includes('site-creator'),'Set your R2 BUCKET name');
 assert(config.assets?.directory==='dist/client'&&config.main==='dist/server/index.js','Use the production dist paths');
 console.log('PASS: production configuration has real binding values (remote existence is not checked).');
}
console.log(`PASS: ${assets.length} assets ≤25 MiB each; real model ${manifest.model}; SHA-256, WASM, Worker, MediaPipe, server and migrations verified.`);
if(configIndex<0)console.log('Account setup still requires wrangler.production.jsonc and remote D1 migrations. Recheck with --config before deploying.');
