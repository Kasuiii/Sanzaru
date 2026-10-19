import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compile=p=>ts.transpileModule(fs.readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const shared=url(compile('../lib/asl-shared.ts'));
const inference=url(compile('../lib/asl-inference.ts').replace('"./asl-shared"',JSON.stringify(shared)));
const {AslAutoSendGate}=await import(url(compile('../lib/asl-auto-send.ts').replace('"./asl-inference"',JSON.stringify(inference))));
const empty={letter:null,confidence:0,heldMs:0,at:0,stable:false};
const frame=(at,confidence=.95,letter='A')=>({letter,confidence,heldMs:30000,at,stable:true});
const start=()=>{const gate=new AslAutoSendGate();gate.observe('request-1',empty,0);return gate;};
const feed=(gate,at,confidence=.95,letter='A',key='request-1',canSend=true)=>gate.observe(key,frame(at,confidence,letter),at+10,canSend);
let g=start();
for(let at=100;at<3100;at+=200)assert.equal(feed(g,at).proof,null,'must wait full three seconds');
const result=feed(g,3100);assert.equal(result.proof.letter,'A');assert.equal(result.proof.heldMs,3000);
for(let at=3300;at<10000;at+=200)assert.equal(feed(g,at).proof,null,'one send per request');
g.observe(null,empty,10000);assert.equal(feed(g,11000).proof,null,'same request remains claimed after disconnect');
g.observe('request-2',empty,12000);
for(let at=12100;at<15100;at+=200)assert.equal(feed(g,at,.95,'A','request-2').proof,null);
assert(feed(g,15100,.95,'A','request-2').proof,'fresh request may send the same letter');
for(const confidence of [.9,.899,NaN,Infinity,1.01]){
 g=start();for(let at=100;at<=4100;at+=200)assert.equal(feed(g,at,confidence).proof,null,'strictly greater than 90 percent');
}
for(const interruption of ['low','letter','missing','paused','old']){
 g=start();for(let at=100;at<=2700;at+=200)feed(g,at);
 if(interruption==='low')feed(g,2900,.9);
 if(interruption==='letter')feed(g,2900,.99,'B');
 if(interruption==='missing')g.observe('request-1',empty,2900);
 if(interruption==='paused')g.observe(null,empty,2900);
 if(interruption==='old')g.observe('request-1',frame(100),2900);
 for(let at=3100;at<6100;at+=200)assert.equal(feed(g,at).proof,null,interruption+' resets continuity');
 // A resumed context excludes its first pre-activation frame.
 assert.equal(!!feed(g,6100).proof,interruption!=='paused');
 if(interruption==='paused')assert(feed(g,6300).proof);
}
g=start();feed(g,100);feed(g,300);assert.equal(feed(g,2200).sample.heldMs,0,'missing frames do not count as continuous');
g=start();feed(g,100);
assert.equal(g.observe('request-1',frame(100),1000).proof,null,'render cannot add evidence');
assert.equal(g.observe('request-1',frame(100),3100).proof,null,'stale frame never sends');
g=start();for(let at=100;at<=3100;at+=200)feed(g,at,.95,'A','request-1',false);
assert(feed(g,3100).proof,'busy may defer an already-earned fresh proof');
g.retry('request-1',3200);
for(let at=3300;at<6300;at+=200)assert.equal(feed(g,at).proof,null,'retry requires a new streak');
assert(feed(g,6300).proof);
console.log('PASS: >90%, three seconds, distinct fresh frames, interruptions, pause/resume, one send/request, retry and busy gating.');
