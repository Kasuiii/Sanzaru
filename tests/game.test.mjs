import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source=fs.readFileSync(new URL("../app/game-engine.ts",import.meta.url),"utf8");
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {GameEngine}=await import("data:text/javascript;base64,"+Buffer.from(output).toString("base64"));
const config={hero:0,mission:0,hp:600,duration:120,damage:13,interval:6.8};
function tick(g,n){for(let t=0;t<n;t+=.01)g.step(.01);}
const shot=new GameEngine(config);shot.aim={x:.5,y:.31};shot.begin();tick(shot,1.3);shot.release();tick(shot,.5);assert(shot.bossHp<600);assert.equal(shot.hits,1);
const miss=new GameEngine(config);miss.aim={x:.01,y:.95};miss.begin();tick(miss,.7);miss.release();tick(miss,.5);assert.equal(miss.bossHp,600);assert.equal(miss.hits,0);
const pass=new GameEngine(config);pass.pass();pass.pass();assert.equal(pass.passes,1);tick(pass,1.2);assert(pass.bossHp<600);assert.equal(pass.hits,1);
const shield=new GameEngine(config);tick(shield,6.6);shield.defend();tick(shield,2);assert.equal(shield.hp,100);assert.equal(shield.blocks,1);assert(shield.bossHp<600);
const damage=new GameEngine(config);tick(damage,8.1);assert(damage.hp<100);
const timeout=new GameEngine({...config,duration:1});tick(timeout,1.5);assert.equal(timeout.status,"lost");
const win=new GameEngine({...config,hp:20});win.pass();tick(win,2);assert.equal(win.status,"won");const final=win.score;tick(win,1);assert.equal(win.score,final);
const tank=new GameEngine({...config,hero:2});assert.equal(tank.hp,125);
console.log("Passed: aimed shot, miss, combo cooldown, shield reflection, incoming damage, timeout, victory terminal state, hero bonus.");
