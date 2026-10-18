import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const url=code=>'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const compile=p=>ts.transpileModule(fs.readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const shared=url(compile('../lib/asl-shared.ts'));
const {AslStabilizer,readAslHealth,readAslPrediction,sampleProof}=await import(url(compile('../lib/asl-inference.ts').replace('"./asl-shared"',JSON.stringify(shared))));
const id='a'.repeat(64),health={protocol:'asl-alphabet-v1',ready:true,letters:['A','B','C','L','Y'],model_id:id,confidence:.75,input_mode:'full-frame',task:'detect'};
assert.equal(readAslHealth(health).modelId,id);
for(const change of [{protocol:'old-spells'},{ready:false},{letters:['A','B']},{letters:['A','B','C','L','?']},{model_id:'no'},{confidence:.3},{task:'pose'},{input_mode:'guess'}])assert.throws(()=>readAslHealth({...health,...change}));
assert.deepEqual(readAslPrediction({protocol:health.protocol,model_id:id,letter:'None',confidence:0},id),{letter:null,confidence:0});
for(const change of [{model_id:'b'.repeat(64)},{letter:'?'},{letter:'Victory'},{confidence:Infinity},{confidence:1.1}])assert.throws(()=>readAslPrediction({protocol:health.protocol,model_id:id,letter:'A',confidence:.9,...change},id));
const f=new AslStabilizer();assert.equal(readAslHealth({...health,confidence:.5}).confidence,.5);assert.throws(()=>readAslHealth({...health,confidence:.499}));const relaxed=new AslStabilizer(.5);assert.equal(relaxed.observe('A',.5,1000,1100).stable,false);assert.equal(relaxed.observe('A',.5,1500,1600).stable,false);assert.equal(relaxed.observe('A',.5,2000,2100).stable,true);assert.equal(relaxed.observe('A',.499,2500,2600).letter,null);
assert.equal(f.observe('A',.9,1000,1100).stable,false);
assert.equal(f.observe('A',.9,1500,1600).stable,false);
const stable=f.observe('A',.9,2000,2100);assert.equal(stable.stable,true);
assert.equal(sampleProof(stable,2100).sampleAgeMs,100);
assert.equal(sampleProof(stable,3501),null);
assert.equal(sampleProof(stable,1999),null);
assert.equal(f.observe('B',.9,2500,2600).heldMs,0);
assert.equal(f.observe('B',.5,3000,3100).letter,null);
assert.equal(f.observe('B',.9,3500,3600).stable,false);
assert.equal(f.observe(null,0,4000,4100).letter,null);
assert.equal(f.observe('B',.9,4500,6200).letter,null);
assert.equal(f.observe('B',.9,6500,6400).letter,null);
f.reset();f.observe('C',.9,1000,1100);f.observe('C',.9,1500,1600);
assert.equal(f.observe('C',.9,1500,1700).heldMs,0,'same frame cannot add hold time');
assert.equal(f.observe('C',.9,4000,4100).heldMs,0,'long gap resets evidence');
f.reset();assert.equal(f.observe('C',.9,4500,4600).heldMs,0,'explicit reset requires new observations');
console.log('PASS: ASL protocol, A-Z class alphabet, model identity, confidence, fresh capture-time evidence, switching letters, gaps, duplicates and reset. No model accuracy is implied.');

for (const letter of ['J','Z']) assert.equal(readAslPrediction({protocol:health.protocol,model_id:id,letter,confidence:.9},id).letter,letter);
