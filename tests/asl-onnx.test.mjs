import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const url = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const compile = path => ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const shared = url(compile('../lib/asl-shared.ts'));
const {ASL_ALPHABET, normalizeLetters} = await import(shared);
const {readAslManifest, manifestLetters, fingerprintPayload, inferenceRegion, letterbox, rgbaToNchw, decodeDetections, selectAslDetection} = await import(url(compile('../lib/asl-onnx.ts').replace('"./asl-shared"', JSON.stringify(shared))));
const base = {schema:1, model:'model.onnx', sha256:'a'.repeat(64), task:'detect', inputSize:640, inputName:'images', outputName:'output0', outputFormat:'end2end', labels:['Z','B','A','C','J',null], confidence:.75, iou:.45, associationOverlap:.2};
const m = readAslManifest(base);
assert.deepEqual(manifestLetters(m), ['A','B','C','J','Z']);
assert.equal(normalizeLetters(ASL_ALPHABET).length,26);
for (const change of [{labels:['A','B']},{labels:['A','B','C','D','Victory']},{labels:['A','A','A','A','A']},{sha256:'x'},{task:'classify'},{inputSize:641},{confidence:.2},{outputFormat:'auto'}]) assert.throws(() => readAslManifest({...base,...change}));
assert.equal(fingerprintPayload(m,'1'),fingerprintPayload({...m,model:'https://other.example/model.onnx'},'1'));
for (const change of [{labels:['A','B','Z','C','J',null]},{confidence:.8},{sha256:'b'.repeat(64)},{iou:.6},{associationOverlap:.5}]) assert.notEqual(fingerprintPayload(m,'1'),fingerprintPayload({...m,...change},'1'));
assert.notEqual(fingerprintPayload(m,'1'),fingerprintPayload(m,'2'));
const t = letterbox(640,480,640);
assert.equal(t.top,80); assert.equal(t.left,0);
assert.equal(letterbox(480,640,640).left,80);
assert.equal(letterbox(333,100,640).resizedHeight,192);
const rgb = rgbaToNchw(new Uint8ClampedArray([255,0,128,255]),1);
assert.deepEqual([...rgb].slice(0,2),[1,0]); assert(Math.abs(rgb[2]-128/255)<1e-6);
const data = new Float32Array([
  100,180,300,380,.9,2, // A, mapped class ID, non-square unletterboxing
  101,181,299,379,.85,2, // end2end does not run NMS again
  400,180,500,280,.99,0, // Z on another hand/location
  100,180,300,380,.2,4, // below threshold
  100,180,300,380,NaN,1,
  100,180,300,380,.99,1.5,
  100,180,300,380,1.2,1,
  300,180,100,380,.9,1,
]);
const detections = decodeDetections(data,[1,8,6],m,t);
assert.equal(detections.length,3);
const hand = {x1:.15,y1:.2,x2:.48,y2:.64};
assert.equal(selectAslDetection(detections,hand,m).letter,'A');
const a = detections.find(d=>d.classId===2);
assert(Math.abs(a.box.y1-100/480)<1e-6);
assert.equal(selectAslDetection(detections,{x1:0,y1:0,x2:.01,y2:.01},m).letter,null);
assert.equal(selectAslDetection([{box:hand,classId:5,confidence:.99},...detections],hand,m).letter,null,'neutral class must not turn into a lower scoring letter');
assert.throws(()=>decodeDetections(data,[1,6,8],m,t));
// Two overlapping A candidates, one B at the same box and a separate A.
const rows = [[200,280,200,200,0,0,.95,0,0,0],[201,281,200,200,0,0,.9,0,0,0],[200,280,200,200,0,.8,0,0,0,0],[500,280,80,80,0,0,.9,0,0,0]];
const bnc = decodeDetections(new Float32Array(rows.flat()),[1,4,10],{...m,outputFormat:'raw-bnc'},t);
const bcn = decodeDetections(new Float32Array(Array.from({length:10},(_,c)=>rows.map(row=>row[c])).flat()),[1,10,4],{...m,outputFormat:'raw-bcn'},t);
assert.deepEqual(bnc,bcn); assert.equal(bnc.length,3,'class-aware NMS preserves another class and spatially distinct hand');
assert.equal(selectAslDetection(bnc,hand,m).letter,'A');
console.log('PASS: ONNX manifest, A–Z mapping, fingerprint, RGB/NCHW, letterbox, all three output layouts, NMS, neutral/invalid scores and hand association.');

assert.equal(readAslManifest({...base,confidence:.5}).confidence,.5);
for (const change of [{confidence:.499},{inputMode:'guess'},{mirror:'true'}]) assert.throws(()=>readAslManifest({...base,...change}));
for (const change of [{inputMode:'hand-crop'},{mirror:true}]) assert.notEqual(fingerprintPayload(m,'1'),fingerprintPayload({...m,...change},'1'));
for (const hand of [{x1:.45,y1:.4,x2:.5,y2:.5},{x1:0,y1:0,x2:.07,y2:.1},{x1:.9,y1:.85,x2:1,y2:1}]) {
 const plain=inferenceRegion(1280,720,hand,true,false),flipped=inferenceRegion(1280,720,hand,true,true);
 assert(plain.x>=0&&plain.y>=0&&plain.x+plain.width<=1280&&plain.y+plain.height<=720);
 assert(plain.width>=128&&plain.height>=128);
 assert(plain.hand.x1>=0&&plain.hand.x2<=1&&plain.hand.y1>=0&&plain.hand.y2<=1);
 assert.equal(flipped.hand.x1,1-plain.hand.x2);assert.equal(flipped.hand.x2,1-plain.hand.x1);
 assert(Math.abs((plain.hand.x1*plain.width+plain.x)/1280-hand.x1)<1e-10,'crop keeps exact hand coordinates');
}
const full=inferenceRegion(1280,720,hand,false,false);assert.deepEqual(full,{x:0,y:0,width:1280,height:720,hand});
assert.throws(()=>inferenceRegion(1280,720,{...hand,x1:NaN},true,false));
const buffer=new Float32Array(3);assert.equal(rgbaToNchw(new Uint8ClampedArray([255,0,128,255]),1,buffer),buffer);
assert.throws(()=>rgbaToNchw(new Uint8ClampedArray(4),1,new Float32Array(6)));
console.log('PASS: distant/edge crops, mirrored hand association, transform fingerprint and reusable RGB buffer.');
