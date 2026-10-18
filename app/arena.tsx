"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Orbit,Pause,Play,RotateCcw,Clock3,Heart,Maximize2,Shield,Sparkles,Camera,MousePointer2,Trophy,Send,Zap,Crosshair,Volume2,Flame,Star,Check,Keyboard} from "lucide-react";
import {Progress} from "@/components/ui/progress";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {heroes,missions,CharacterArt} from "./game-data";
import {BossBanter,RoundVerdict,flavorNotice} from "./game-flavor";
import {GameEngine} from "./game-engine";
import type {HandCamera} from "./use-hand-camera";

type Props={hero:number;mission:number;mode:string;sound:boolean;motion:boolean;camera:HandCamera;externallyPaused:boolean;onExit:()=>void;onFinish:(score:number)=>void;onReplay:()=>void};
export function Arena({hero,mission,mode,sound,motion,camera,externallyPaused,onExit,onFinish,onReplay}:Props){
 const engineRef=useRef<GameEngine|null>(null);
 if(!engineRef.current)engineRef.current=new GameEngine({hero,mission,...missions[mission]});
 const g=engineRef.current,m=missions[mission],h=heroes[hero],partner=hero===1?0:1;
 const [,render]=useState(0),[paused,setPaused]=useState(false),[countdown,setCountdown]=useState<number|null>(3);
 const [cameraFallback,setCameraFallback]=useState(false);
 const boardRef=useRef<HTMLDivElement>(null),audioRef=useRef<AudioContext|null>(null),finishedRef=useRef(false),settingsRef=useRef({paused,countdown,externallyPaused,sound,mode,cameraFallback});
 settingsRef.current={paused,countdown,externallyPaused,sound,mode,cameraFallback};
 const cameraRef=useRef(camera);cameraRef.current=camera;
 const effectiveMode=mode==="camera"&&!cameraFallback?"camera":"mouse";
 const soundEffect=useCallback((kind:string)=>{
  if(!settingsRef.current.sound)return;
  try{
   const ctx=audioRef.current||(audioRef.current=new AudioContext());
   if(ctx.state==="suspended")void ctx.resume();
   const gain=ctx.createGain();gain.gain.setValueAtTime(.045,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.23);gain.connect(ctx.destination);
   const osc=ctx.createOscillator();osc.type=kind==="damage"?"sawtooth":"sine";const note=kind==="combo"?720:kind==="shield"?520:kind==="pass"?400:kind==="hit"?260:kind==="shoot"?650:kind==="win"?900:kind==="warning"?160:120;
   osc.frequency.setValueAtTime(note,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(kind==="shoot"?160:note*1.5,ctx.currentTime+.2);osc.connect(gain);osc.start();osc.stop(ctx.currentTime+.24);
  }catch{}
 },[]);
 useEffect(()=>()=>{void audioRef.current?.close();},[]);
 useEffect(()=>{if(countdown===null||paused||externallyPaused)return;const t=setTimeout(()=>setCountdown(n=>n===null?null:n<=1?null:n-1),800);return()=>clearTimeout(t);},[countdown,paused,externallyPaused]);
 useEffect(()=>{const onVisibility=()=>{if(document.hidden&&g.status==="running")setPaused(true);};document.addEventListener("visibilitychange",onVisibility);return()=>document.removeEventListener("visibilitychange",onVisibility);},[g]);
 const available=()=>g.status==="running"&&!settingsRef.current.paused&&!settingsRef.current.externallyPaused&&settingsRef.current.countdown===null;
 const pass=()=>{if(available())g.pass();};
 const defend=()=>{if(available())g.defend();};
 useEffect(()=>{
  let id=0,last=0,paint=0,lastGesture="None";
  const frame=(now:number)=>{
   const s=settingsRef.current;const dt=last?Math.min((now-last)/1000,.07):0;last=now;
   if(!s.paused&&!s.externallyPaused&&s.countdown===null){
    if(s.mode==="camera"&&!s.cameraFallback){
     const hand=cameraRef.current.sampleRef.current;
     if(hand.at&&now-hand.at<650){
      g.aim.x+=(hand.x-g.aim.x)*.25;g.aim.y+=(hand.y-g.aim.y)*.25;
      if(hand.gesture!==lastGesture){
       if(hand.gesture==="Closed_Fist")g.begin();
       else if(hand.gesture==="Open_Palm")g.release();
       else if(hand.gesture==="Victory")g.pass();
       else if(hand.gesture==="Thumb_Up")g.defend();
       else{g.charging=false;g.charge=0;}
       lastGesture=hand.gesture;
      }
     }else{g.charging=false;g.charge=0;lastGesture="None";}
    }
    g.step(dt);
    if(g.audioEvent){soundEffect(g.audioEvent);g.audioEvent="";}
    if(g.status!=="running"&&!finishedRef.current){finishedRef.current=true;onFinish(g.score);}
   }else{g.charging=false;g.charge=0;lastGesture="None";}
   if(now-paint>32){paint=now;render(n=>n+1);}
   id=requestAnimationFrame(frame);
  };id=requestAnimationFrame(frame);return()=>cancelAnimationFrame(id);
 },[g,onFinish,soundEffect]);
 useEffect(()=>{
  const keydown=(e:KeyboardEvent)=>{
   if((e.target as HTMLElement)?.closest("input,textarea,button,[role=dialog]"))return;
   if(e.key==="Escape"){if(g.status==="running"){e.preventDefault();setPaused(p=>!p);}return;}
   if(!available()||settingsRef.current.mode==="camera"&&!settingsRef.current.cameraFallback)return;
   if([" ","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","e","E","q","Q"].includes(e.key))e.preventDefault();
   if(e.key===" "&&!e.repeat)g.begin();
   if(e.key.toLowerCase()==="e"&&!e.repeat)g.pass();
   if(e.key.toLowerCase()==="q"&&!e.repeat)g.defend();
   if(e.key==="ArrowLeft")g.aim.x=Math.max(.03,g.aim.x-.035);
   if(e.key==="ArrowRight")g.aim.x=Math.min(.97,g.aim.x+.035);
   if(e.key==="ArrowUp")g.aim.y=Math.max(.04,g.aim.y-.035);
   if(e.key==="ArrowDown")g.aim.y=Math.min(.94,g.aim.y+.035);
  };
  const keyup=(e:KeyboardEvent)=>{if(e.key===" "&&available()&&(settingsRef.current.mode!=="camera"||settingsRef.current.cameraFallback)){e.preventDefault();g.release();}};
  window.addEventListener("keydown",keydown);window.addEventListener("keyup",keyup);return()=>{window.removeEventListener("keydown",keydown);window.removeEventListener("keyup",keyup);};
 },[g]);
 const aim=(e:React.PointerEvent<HTMLDivElement>)=>{if(effectiveMode!=="mouse")return;const b=e.currentTarget.getBoundingClientRect();g.aim={x:Math.max(0,Math.min(1,(e.clientX-b.left)/b.width)),y:Math.max(0,Math.min(1,(e.clientY-b.top)/b.height))};};
 const elapsed=Math.max(0,Math.ceil(m.duration-g.time)),clock=Math.floor(elapsed/60)+":"+String(elapsed%60).padStart(2,"0");
 const activeShield=Math.max(0,g.shieldReady-g.time),activePass=Math.max(0,g.passReady-g.time);
 const bossPercent=100*g.bossHp/m.hp,hpPercent=100*g.hp/g.maxHp;
 return <div className="arena-wrap">
  <div className="arena-heading"><div><span className="eyebrow"><span className="short-line"/>BOSS RAID · สนามฝึก</span><h1>{m.name}</h1></div><div className="arena-heading-actions"><span className="control-status">{effectiveMode==="camera"?<Camera size={16}/>:<MousePointer2 size={16}/>} {effectiveMode==="camera"?"ใช้กล้อง":"ใช้เมาส์"}</span><button className="quiet-button" onClick={()=>setPaused(true)}><Pause size={17}/>พักเกม</button></div></div>
  <div className="arena-grid"><section className="battle-panel" aria-label="สนามต่อสู้">
   <div className="battle-hud"><div className="boss-label"><span className="boss-emblem"><Flame size={20}/></span><div><strong>พี่ก้อน · บอสประจำกะ</strong><small>PHASE {g.phase} / 3</small></div></div><div className="boss-health"><div><span>พลังชีวิตบอส</span><b>{Math.ceil(g.bossHp)} / {m.hp}</b></div><Progress value={bossPercent} className="boss-progress" aria-label="พลังชีวิตบอส"/></div><div className={"arena-clock "+(elapsed<20?"low-time":"")}><Clock3 size={18}/>{clock}</div></div>
   <div ref={boardRef} tabIndex={0} role="application" aria-label="เล็งที่บอส กดเมาส์ค้างแล้วปล่อยเพื่อยิง หรือใช้ปุ่มลูกศรและ Space" className={"battle-board "+m.className+(g.warning?" warning":"")+(g.shield?" shielded":"")} onPointerMove={aim} onPointerDown={e=>{if(effectiveMode==="mouse"&&available()){aim(e);e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.focus();g.begin();}}} onPointerUp={e=>{if(effectiveMode==="mouse"&&available()){aim(e);g.release();}if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{g.charging=false;g.charge=0;}}>
    <div className="arena-environment"/><div className="arena-shade"/>
    <div className="board-label"><Sparkles size={13}/>{m.rule}</div>
    <BossBanter time={g.time} health={g.bossHp/m.hp} playerHealth={g.hp/g.maxHp} combo={g.partnerUntil>g.time} warning={g.warning}/>
    <div className="boss-ground" style={{left:g.bossX*100+"%"}}/>
    <img className={"golem "+(g.flash>0?"hit":"")+(g.phase===3?" angry":"")} src="/assets/golem.png" alt="บอสผู้พิทักษ์หินสีม่วง" draggable={false} style={{left:g.bossX*100+"%",top:g.bossY*100+"%"}}/>
    {g.warning&&g.status==="running"&&countdown===null&&<div className="attack-warning"><Shield size={17}/>พี่ก้อนเอาจริงแล้ว · กางโล่!</div>}
    <div className="arena-player" style={{left:"30%"}}><div className="player-aura" style={{"--aura":h.color} as React.CSSProperties}/>{g.shield&&<div className="shield-bubble"/>}<CharacterArt index={hero}/><span className="player-name">{h.name} <small>คุณ</small></span></div>
    <div className={"arena-player partner "+(g.partnerUntil>g.time?"casting":"")} style={{left:"83%"}}><div className="player-aura" style={{"--aura":heroes[partner].color} as React.CSSProperties}/><CharacterArt index={partner}/><span className="player-name">{heroes[partner].name} <small>BOT</small></span></div>
    {g.particles.map(p=>{const t=Math.min(1,p.age/p.duration),arc=p.kind==="pass"?-Math.sin(t*Math.PI)*.18:0;return <div key={p.id} className={"magic-orb "+p.kind} style={{left:(p.x+(p.tx-p.x)*t)*100+"%",top:(p.y+(p.ty-p.y)*t+arc)*100+"%"}}/>;})}
    {g.notices.map(n=><div key={n.id} className={"floating-notice "+n.kind} style={{left:n.x*100+"%",top:(n.y-n.age*.07)*100+"%",opacity:Math.min(1,(1.35-n.age)*2)}}>{flavorNotice(n.text)}</div>)}
    {g.charging&&<div className="charge-orb" style={{left:"30%",top:"72%",width:20+g.charge*46,height:20+g.charge*46,"--aura":h.color} as React.CSSProperties}><span>{Math.round(g.charge*100)}%</span></div>}
    <div className={"aim-reticle "+(g.charging?"charging":"")} style={{left:g.aim.x*100+"%",top:g.aim.y*100+"%",color:h.color}}><Crosshair size={31}/></div>
    <div className="board-bottom"><span className="mini-combo"><Zap size={15}/>{g.combo>1?"HIT COMBO ×"+g.combo:"ชาร์จให้ตึง แล้วค่อยปล่อย"}</span><button className="icon-button" aria-label="เต็มหน้าจอ" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();if(document.fullscreenElement)void document.exitFullscreen();else void boardRef.current?.requestFullscreen().catch(()=>{});}}><Maximize2 size={17}/></button></div>
    {countdown!==null&&<div className="countdown-cover"><div className="eyebrow">เตรียมมือ เตรียมมุก</div><strong key={countdown}>{countdown}</strong><p>{effectiveMode==="camera"?"กำมือชาร์จ แล้วแบมือเพื่อยิง":"กดเมาส์ค้าง เล็งที่บอส แล้วปล่อยเพื่อยิง"}</p></div>}
   </div>
   <div className="player-hud"><div className="player-health"><Heart size={19}/><div><span>พลังชีวิตคุณ <b>{Math.ceil(g.hp)} / {g.maxHp}</b></span><Progress value={hpPercent} className="health-progress" aria-label="พลังชีวิตผู้เล่น"/></div></div><div className="charge-meter"><Zap size={19}/><div><span>{g.charge>=.95?"ชาร์จเต็มแล้ว!":"พลังเวท"}</span><Progress value={g.charge*100} className="charge-progress" aria-label="พลังชาร์จ"/></div></div><div className="score-display"><Trophy size={20}/><div><small>คะแนน</small><b>{g.score.toLocaleString()}</b></div></div></div>
  </section>
  <aside className="arena-sidebar"><div className="arena-controls"><div className="panel-heading"><h2><WandIcon/>เวทของคุณ</h2><span className="pill subtle">{h.name}</span></div><p className="panel-subtitle">{effectiveMode==="camera"?"ยกมือให้อยู่ในกรอบกล้อง":"ใช้เมาส์หรือคีย์บอร์ดได้เลย"}</p>
   <div className="spell-primary"><div className="spell-icon"><Flame size={22}/></div><div><b>ลูกพลัง “รับไปเลย”</b><small>{effectiveMode==="camera"?"กำมือชาร์จ · แบมือยิง":"กดเมาส์ / Space ค้างแล้วปล่อย"}</small></div></div>
   <button className={"spell-button "+(activePass>0?"cooldown":"")} disabled={activePass>0||!available()} onClick={pass}><span className="spell-icon cyan"><Send size={22}/></span><span><b>ส่งพลัง “เพื่อนจัดให้”</b><small>{activePass>0?"พร้อมอีก "+Math.ceil(activePass)+" วินาที":effectiveMode==="camera"?"ชูสองนิ้วเพื่อส่ง":"ผสมธาตุแล้วโจมตีร่วมกัน"}</small></span><kbd>{activePass>0?Math.ceil(activePass):"E"}</kbd></button>
   <button className={"spell-button "+(activeShield>0?"cooldown":"")} disabled={activeShield>0||!available()} onClick={defend}><span className="spell-icon violet"><Shield size={22}/></span><span><b>โล่ “ไม่รับจบ”</b><small>{activeShield>0?"พร้อมอีก "+Math.ceil(activeShield)+" วินาที":effectiveMode==="camera"?"ยกนิ้วโป้งเพื่อใช้โล่":"ใช้เมื่อบอสเตรียมโจมตี"}</small></span><kbd>{activeShield>0?Math.ceil(activeShield):"Q"}</kbd></button>
   {mode==="camera"&&!cameraFallback?<div className="arena-camera"><video ref={camera.attachVideo} autoPlay playsInline muted/><span>{camera.gestureLabel}</span><button className="camera-fallback" onClick={()=>{camera.stop();setCameraFallback(true);}}>เปลี่ยนเป็นเมาส์</button></div>:<div className="aim-tip"><Crosshair size={22}/><p><b>เล็งที่ตัวบอสก่อนปล่อย</b><small>ใช้ปุ่มลูกศรเล็งได้เช่นกัน</small></p></div>}
  </div><div className="partner-note"><span className="partner-note-art"><CharacterArt index={partner}/></span><div><strong>{heroes[partner].name}<span className="bot-label">BOT</span></strong><p>{g.partnerUntil>g.time?"รับงานแล้ว! เดี๋ยวโชว์คอมโบให้ดู":"ส่งพลังมา เดี๋ยวแบกเอง… พูดไปก่อน"}</p></div></div><div className="arena-tip"><Sparkles size={17}/><p>ชาร์จเต็มยิงแรงขึ้น แต่ส่งให้เพื่อนจะได้เวทผสมธาตุ ลองใช้สลับกันดู!</p></div></aside></div>
  <div className="arena-footnote"><span><Keyboard size={15}/>Space ชาร์จ · E ส่งต่อ · Q โล่ · Esc พักเกม</span><span>สนามฝึกกับบอท</span></div>
  <Dialog open={paused&&g.status==="running"} onOpenChange={setPaused}><DialogContent className="portal-dialog"><DialogHeader><div className="dialog-symbol"><Pause/></div><DialogTitle>พักก่อน มือเริ่มพันกัน</DialogTitle><DialogDescription>บอสหยุดแล้ว ไปจิบน้ำได้ ไม่ต้องลน</DialogDescription></DialogHeader><button className="start-button" onClick={()=>setPaused(false)}><Play size={18}/>กลับไปลุยต่อ</button><button className="secondary-button" onClick={onExit}><Orbit size={18}/>กลับห้องปาร์ตี้</button></DialogContent></Dialog>
  <Dialog open={g.status!=="running"}><DialogContent className="portal-dialog result-dialog" showCloseButton={false} onEscapeKeyDown={e=>e.preventDefault()} onPointerDownOutside={e=>e.preventDefault()}><DialogHeader><div className={"result-symbol "+(g.status==="won"?"victory":"")}><Trophy size={40}/></div><div className="eyebrow">{g.status==="won"?"BOSS DOWN. AURA UP.":"SKILL ISSUE? NAH. WARM-UP."}</div><DialogTitle>{g.status==="won"?"บอสแตก ตี้ยังอยู่!":"แพ้บอส ไม่ได้แพ้ชีวิต"}</DialogTitle><DialogDescription>{g.status==="won"?"พี่ก้อนขอลาพักร้อน ส่วนเราขอฉลองก่อน":"รอบนี้แค่วอร์ม รอบหน้าลองส่งพลังกับกางโล่ให้ทัน"}</DialogDescription></DialogHeader><RoundVerdict won={g.status==="won"} hits={g.hits} passes={g.passes} blocks={g.blocks}/><div className="result-score"><span>คะแนนรอบนี้</span><strong>{g.score.toLocaleString()}</strong></div><div className="result-stats"><div><Send size={19}/><strong>{g.passes}</strong><span>ส่งพลัง</span></div><div><Shield size={19}/><strong>{g.blocks}</strong><span>สะท้อนสำเร็จ</span></div><div><Clock3 size={19}/><strong>{Math.floor(g.time)}s</strong><span>เวลาเล่น</span></div></div><button className="start-button" onClick={onReplay}><RotateCcw size={18}/>อีกตาเดียว (จริง ๆ)</button><button className="secondary-button" onClick={onExit}>กลับห้องปาร์ตี้</button></DialogContent></Dialog>
 </div>;
}
function WandIcon(){return <Sparkles size={19}/>;}
