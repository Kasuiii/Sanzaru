import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/party-engine.ts',import.meta.url),'utf8');
const out=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {newPlayer,newRoom,applyAction,advanceRoom,roomView,validateActions,bossX}=await import('data:text/javascript;base64,'+Buffer.from(out).toString('base64'));
let now=100000;
const host=newPlayer('host','host-secret','Ember',0,now),guest=newPlayer('guest','guest-secret','Lumi',1,now);
const s=newRoom('ABC234',host,0,now);s.players.push(guest);
function act(id,type,rest={}){const p=s.players.find(p=>p.id===id);applyAction(s,id,{seq:p.ack+1,type,...rest},now);}
function tick(ms){now+=ms;s.players.forEach(p=>p.lastSeen=now);advanceRoom(s,now);}
assert.throws(()=>act('host','start'));
act('host','ready',{ready:true});act('guest','ready',{ready:true});assert.throws(()=>act('guest','start'));
act('host','start');assert.equal(s.phase,'countdown');tick(3100);assert.equal(s.phase,'playing');
act('host','pass');const passSeq=s.players[0].ack;applyAction(s,'host',{seq:passSeq,type:'pass'},now);assert.equal(s.players[0].passes,1);tick(650);assert(s.players[1].comboUntil>s.time);
act('guest','begin');tick(1400);act('guest','release',{x:bossX(s),y:.31});tick(500);assert(s.bossHp<s.bossMax-100);assert.equal(s.players[1].hits,1);assert.equal(s.players[1].comboUntil,0);
const view=roomView(s,'guest',3,now);assert(!JSON.stringify(view).includes('secret'));assert.equal(view.players[0].key,undefined);
const beforePause=s.time;act('guest','pause');tick(4000);assert.equal(s.time,beforePause);act('guest','resume');tick(3100);assert.equal(s.phase,'playing');
now+=9000;advanceRoom(s,now);assert.equal(s.phase,'paused');assert.equal(s.pauseReason,'connection');const hp=s.players.map(p=>p.hp),time=s.time;now+=20000;advanceRoom(s,now);assert.deepEqual(s.players.map(p=>p.hp),hp);assert.equal(s.time,time);s.players.forEach(p=>p.lastSeen=now);advanceRoom(s,now);assert.equal(s.phase,'countdown');tick(3100);assert.equal(s.phase,'playing');
assert.throws(()=>validateActions([{seq:1,type:'release',x:NaN,y:.3}]));assert.throws(()=>validateActions([{seq:1,type:'configure',hero:99}]));
act('host','pause');act('host','rematch');assert.equal(s.phase,'lobby');assert(s.players.every(p=>!p.ready));act('host','ready',{ready:true});act('guest','ready',{ready:true});act('host','start');tick(3100);
// Drive a whole round through real charge/release actions, keeping both peers present.
for(let i=0;i<30&&s.phase==='playing';i++){act('host','begin');tick(1400);act('host','release',{x:bossX(s),y:.31});tick(450);}
assert.equal(s.phase,'won');const score=s.score;tick(3000);assert.equal(s.score,score);
act('host','rematch');act('guest','leave');assert.equal(s.players.length,1);assert.equal(s.phase,'lobby');act('host','leave');assert.equal(s.phase,'closed');
console.log('PASS: ready/start authorization, teammate combo, duplicate commands, token redaction, shared pause/resume, disconnect recovery, invalid inputs, full-round victory and rematch/leave.');
