export type Particle={id:number;x:number;y:number;tx:number;ty:number;age:number;duration:number;kind:"shot"|"enemy"|"pass"|"combo"|"reflect";damage:number};
export type Notice={id:number;text:string;x:number;y:number;age:number;kind:string};
export type GameConfig={hero:number;mission:number;hp:number;duration:number;damage:number;interval:number};
export class GameEngine{
 config:GameConfig;time=0;bossHp:number;maxHp:number;hp:number;score=0;charge=0;charging=false;shieldUntil=0;shieldReady=0;passReady=0;lastShot=-1;nextAttack=6;combo=0;hits=0;shots=0;blocks=0;passes=0;phase=1;status:"running"|"won"|"lost"="running";aim={x:.5,y:.3};particles:Particle[]=[];notices:Notice[]=[];id=0;flash=0;audioEvent="";partnerUntil=0;
 constructor(config:GameConfig){this.config=config;this.bossHp=config.hp;this.maxHp=config.hero===2?125:100;this.hp=this.maxHp;this.nextAttack=config.interval;}
 get bossX(){return .5+Math.sin(this.time*.55)*(.045+(this.phase-1)*.025);}
 get bossY(){return .31;}
 get shield(){return this.shieldUntil>this.time;}
 get warning(){return this.nextAttack-this.time<1.6;}
 notice(text:string,x=.5,y=.47,kind="info"){this.notices.push({id:++this.id,text,x,y,age:0,kind});}
 begin(){if(this.status==="running"&&this.time-this.lastShot>.35)this.charging=true;}
 release(){
  if(!this.charging||this.status!=="running")return;
  this.charging=false;const c=this.charge;this.charge=0;if(c<.08)return;
  this.lastShot=this.time;this.shots++;
  let d=(15+c*60)*(this.config.hero===0?1.2:1);
  if(this.config.mission===2&&c>=.95)d*=1.3;
  this.particles.push({id:++this.id,x:.3,y:.81,tx:this.aim.x,ty:this.aim.y,age:0,duration:.36,kind:"shot",damage:Math.round(d)});
  this.audioEvent="shoot";
 }
 pass(){
  if(this.status!=="running"||this.time<this.passReady)return;
  this.charging=false;this.charge=0;this.passReady=this.time+(this.config.hero===3?6:8);this.partnerUntil=this.time+1.7;this.passes++;
  this.particles.push({id:++this.id,x:.3,y:.78,tx:.83,ty:.75,age:0,duration:.5,kind:"pass",damage:75*(this.config.mission===1?1.5:1)});
  this.notice("ส่งพลังให้คู่หู!",.72,.68,"combo");this.audioEvent="pass";
 }
 defend(){
  if(this.status!=="running"||this.time<this.shieldReady)return;
  this.charging=false;this.charge=0;this.shieldUntil=this.time+(this.config.hero===1?3.3:2.3);this.shieldReady=this.time+7;
  this.notice("โล่พร้อมรับพลัง",.3,.66,"shield");this.audioEvent="shield";
 }
 hurtBoss(d:number,kind:string){
  this.bossHp=Math.max(0,this.bossHp-d);this.score+=Math.round(d*3);this.hits++;this.combo++;this.flash=.16;
  this.notice("-"+Math.round(d),this.bossX,this.bossY-.08,kind);this.audioEvent=kind==="combo"?"combo":"hit";
 }
 step(dt:number){
  if(this.status!=="running")return;
  this.time+=dt;this.flash=Math.max(0,this.flash-dt);
  this.phase=this.bossHp>this.config.hp*.66?1:this.bossHp>this.config.hp*.33?2:3;
  if(this.charging)this.charge=Math.min(1,this.charge+dt/1.3);
  if(this.time>=this.nextAttack){
   this.particles.push({id:++this.id,x:this.bossX,y:.36,tx:.3,ty:.81,age:0,duration:1.2,kind:"enemy",damage:this.config.damage+(this.phase-1)*3});
   this.nextAttack=this.time+Math.max(3.1,this.config.interval-(this.phase-1)*.8);this.audioEvent="warning";
  }
  const keep:Particle[]=[],spawn:Particle[]=[];
  for(const p of this.particles){
   p.age+=dt;if(p.age<p.duration){keep.push(p);continue;}
   if(p.kind==="enemy"){
    if(this.shield){this.blocks++;this.score+=80;this.notice("สะท้อนสำเร็จ!",.3,.64,"shield");spawn.push({id:++this.id,x:.3,y:.77,tx:this.bossX,ty:.31,age:0,duration:.36,kind:"reflect",damage:35});this.audioEvent="shield";}
    else{this.hp=Math.max(0,this.hp-p.damage);this.combo=0;this.notice("-"+p.damage+" HP",.3,.63,"damage");this.audioEvent="damage";}
   }else if(p.kind==="pass"){
    spawn.push({id:++this.id,x:.83,y:.73,tx:this.bossX,ty:.31,age:0,duration:.6,kind:"combo",damage:p.damage});this.notice("FROSTFIRE COMBO",.73,.54,"combo");
   }else if(p.kind==="combo"||p.kind==="reflect"){this.hurtBoss(p.damage,p.kind);}
   else if(Math.abs(p.tx-this.bossX)<.16&&Math.abs(p.ty-this.bossY)<.19){this.hurtBoss(p.damage,"hit");}
   else{this.combo=0;this.notice("เล็งไปที่ตัวบอส",p.tx,p.ty,"miss");}
  }
  this.particles=[...keep,...spawn];this.notices=this.notices.filter(n=>(n.age+=dt)<1.35).slice(-12);
  if(this.bossHp<=0){this.status="won";this.score+=Math.round((this.config.duration-this.time)*8+this.hp*4+500);this.charging=false;this.audioEvent="win";}
  else if(this.hp<=0||this.time>=this.config.duration){this.status="lost";this.charging=false;this.audioEvent="lose";}
 }
}
