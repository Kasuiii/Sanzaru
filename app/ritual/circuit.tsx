"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {Camera,MousePointer2,RotateCcw,Hand,LoaderCircle,VideoOff,Sparkles,ScanLine} from "lucide-react";
import {Tabs,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {GESTURES,NODES,nodeAt,traceNodes,trimTrace,type TracePoint} from "@/lib/ritual-shared";
import type {RitualParty} from "../use-ritual-party";
import type {HandCamera} from "../use-hand-camera";
export function CircuitDesk({party,camera,mode,setMode}:{party:RitualParty;camera:HandCamera;mode:string;setMode:(mode:string)=>void}){
 const r=party.room!,[path,setPath]=useState<TracePoint[]>([]),[cursor,setCursor]=useState({x:.5,y:.5}),[holding,setHolding]=useState({gesture:"",value:0}),[sending,setSending]=useState(false),[hint,setHint]=useState("ถามสูตรจากคนกลาง แล้วเริ่มจากจุดที่เขาบอก");
 const data=useRef({path:[] as TracePoint[],start:0,begun:false,sent:false,dragging:false,pose:"",poseAt:0,hover:0,hoverAt:0,stamp:0}),latest=useRef({party,mode,camera});latest.current={party,mode,camera};
 const board=useRef<HTMLDivElement>(null);
 const active=r.phase==="playing"&&party.connection==="online"&&r.time>=(r.castReady||0);
 const reset=useCallback((cancel=true)=>{if(cancel&&data.current.begun&&!data.current.sent&&latest.current.party.room?.phase==="playing")latest.current.party.send({type:"cancel"});data.current={path:[],start:0,begun:false,sent:false,dragging:false,pose:"",poseAt:0,hover:0,hoverAt:0,stamp:0};setPath([]);setHolding({gesture:"",value:0});setSending(false);setHint("ถามสูตรจากคนกลาง แล้วเริ่มจากจุดที่เขาบอก");},[]);
 useEffect(()=>{reset(false);},[r.challenge,r.feedback?.id,r.phase,reset]);
 useEffect(()=>{if(party.error){reset(false);setHint("ลองเริ่มวงจรใหม่เมื่อเชื่อมต่อพร้อมแล้ว");}},[party.error,reset]);
 const append=useCallback((point:{x:number;y:number},now:number)=>{
  const room=latest.current.party.room;if(!room||room.phase!=="playing"||latest.current.party.connection!=="online"||room.time<(room.castReady||0)||data.current.sent)return;
  const d=data.current;
  if(!d.begun){if(!nodeAt(point)){setHint("เริ่มลากจากจุดหมายเลขที่คนกลางบอก");return;}d.begun=true;d.start=now;latest.current.party.send({type:"begin"});setHint("ลากผ่านจุดตามลำดับ แล้วทำท่าปิดผนึกค้าง");}
  const last=d.path.at(-1),distance=last?Math.hypot(point.x-last.x,point.y-last.y):1;if(last&&distance<.009)return;
  const additions:TracePoint[]=[];
  if(last){const steps=Math.max(1,Math.ceil(distance/.04));for(let i=1;i<=steps;i++){const t=i/steps;additions.push({x:+(last.x+(point.x-last.x)*t).toFixed(4),y:+(last.y+(point.y-last.y)*t).toFixed(4),t:Math.round(last.t+((now-d.start)-last.t)*t)});}}
  else additions.push({x:+point.x.toFixed(4),y:+point.y.toFixed(4),t:0});
  if(d.path.length+additions.length>195){setHint("เส้นยาวเกินไป ล้างวงจรแล้วลองลากให้กระชับ");return;}
  d.path.push(...additions);setPath([...d.path]);
 },[]);
 const cast=useCallback((gesture:string,hold:number)=>{
  const d=data.current,party=latest.current.party,r=party.room;if(d.sent||!r||r.phase!=="playing"||!d.begun)return;
  const trace=trimTrace(d.path);if(traceNodes(trace).length<2){setHint("ลากวงจรก่อนทำท่าปิดผนึก");return;}
  d.sent=true;setSending(true);setHint("กำลังส่งวงจรไปผนึกเงาอคติ…");const seq=party.send({type:"cast",challenge:r.challenge,path:trace,gesture,hold});if(!seq){d.sent=false;setSending(false);setHint("รอการเชื่อมต่อ แล้วทำท่าปิดผนึกอีกครั้ง");}
 },[]);
 useEffect(()=>{
  let frame=0,last=0;const tick=(now:number)=>{
   const {camera,mode,party}=latest.current,r=party.room,d=data.current;
   if(mode==="camera"&&r?.phase==="playing"&&!d.sent&&camera.status==="ready"&&now-last>65){
    last=now;const hand=camera.sampleRef.current;
    if(hand.visible&&now-hand.at<500){const point={x:hand.fingerX,y:hand.fingerY};setCursor(point);
     if(hand.gesture==="Pointing_Up"){
      d.pose="";setHolding({gesture:"",value:0});const node=nodeAt(point);
      if(d.begun)append(point,now);else if(node){if(d.hover!==node){d.hover=node;d.hoverAt=now;}else if(now-d.hoverAt>=300)append(point,now);}else d.hover=0;
     }else if(d.begun&&GESTURES.some(g=>g.id===hand.gesture)&&hand.confidence>=.6){
      if(d.pose!==hand.gesture){d.pose=hand.gesture;d.poseAt=now;}const held=now-d.poseAt;setHolding({gesture:d.pose,value:Math.min(1,held/850)});if(held>=850)cast(d.pose,Math.round(held));
     }else{d.pose="";d.hover=0;setHolding({gesture:"",value:0});}
    }else{d.pose="";d.hover=0;setHolding({gesture:"",value:0});}
   }
   frame=requestAnimationFrame(tick);
  };frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[append,cast]);
 function pointOf(e:React.PointerEvent<HTMLDivElement>){const rect=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))};}
 const visited=traceNodes(path),gesture=GESTURES.find(g=>g.id===holding.gesture);
 return <section className="circuit-desk" aria-label="โต๊ะร่ายเวท"><div className="desk-heading"><div><span className="ritual-kicker">KIKAZARU · LET UNDERSTANDING GUIDE YOUR HANDS</span><h2>ให้ความเข้าใจนำทางมือ</h2></div><button className="quiet-button" disabled={!active||sending||!path.length} onClick={()=>reset()}><RotateCcw size={16}/>ล้างวงจร</button></div>
 <Tabs value={mode} onValueChange={v=>{reset();setMode(v);if(v==="mouse")camera.stop();}}><TabsList className="control-tabs ritual-control-tabs"><TabsTrigger value="camera"><Camera size={16}/>ร่ายด้วยนิ้ว</TabsTrigger><TabsTrigger value="mouse"><MousePointer2 size={16}/>เมาส์ / คีย์บอร์ด</TabsTrigger></TabsList></Tabs>
 <div className="circuit-and-camera"><div ref={board} className={"circuit-board "+(sending?"casting":"")} role="group" aria-label="วงจรเวท 9 จุด" onPointerDown={e=>{if(mode!=="mouse"||!active||sending)return;data.current.dragging=true;e.currentTarget.setPointerCapture(e.pointerId);append(pointOf(e),performance.now());}} onPointerMove={e=>{if(mode==="mouse"&&data.current.dragging)append(pointOf(e),performance.now());}} onPointerUp={e=>{data.current.dragging=false;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{data.current.dragging=false;}}>
  <svg viewBox="0 0 100 100" aria-hidden="true" className="circuit-lines"><circle cx="50" cy="50" r="43"/><circle cx="50" cy="50" r="46"/>{NODES.map(n=><path key={n.id} d={"M"+(n.x*100-2)+" "+n.y*100+"h4 M"+n.x*100+" "+(n.y*100-2)+"v4"}/>)}{path.length>0&&<polyline className="drawn-circuit" points={path.map(p=>p.x*100+","+p.y*100).join(" ")}/>}</svg>
  {NODES.map(n=><button key={n.id} className={"circuit-node "+(visited.includes(n.id)?"visited":"")+(visited.at(-1)===n.id?"last":"")} style={{left:n.x*100+"%",top:n.y*100+"%"}} disabled={mode!=="mouse"||!active||sending} aria-label={"จุดวงจร "+n.id} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();append(n,performance.now());}}}>{n.id}</button>)}
  {mode==="camera"&&camera.status==="ready"&&<span className="finger-cursor" style={{left:cursor.x*100+"%",top:cursor.y*100+"%"}}><ScanLine size={28}/></span>}
  {sending&&<div className="circuit-sending"><LoaderCircle className="spin"/><span>กำลังตรวจเวท…</span></div>}
 </div><div className="circuit-instructions">{mode==="camera"?<><div className="ritual-camera"><video autoPlay playsInline muted ref={camera.attachVideo}/>{camera.status!=="ready"&&<div><Camera size={30}/><b>ปลายนิ้วคือพู่กันผนึก</b><p>{camera.error||"ให้มืออยู่ในกรอบและมีแสงเพียงพอ"}</p><button className="secondary-button" disabled={camera.status==="loading"} onClick={camera.start}>{camera.status==="loading"?<LoaderCircle className="spin" size={16}/>:<Camera size={16}/>}เปิดกล้อง</button></div>}{camera.status==="ready"&&<button className="camera-stop icon-button" aria-label="ปิดกล้อง" onClick={camera.stop}><VideoOff size={17}/></button>}</div><ol><li>ชูนิ้วชี้ ค้างที่จุดเริ่มสักครู่</li><li>ขยับปลายนิ้วตามลำดับที่เพื่อนบอก</li><li>ทำท่าปิดผนึกค้าง 0.9 วินาที</li></ol><p className="camera-current"><Hand size={16}/>{camera.status==="ready"?camera.gestureLabel:camera.privacyLabel}</p><small className="custom-game-privacy">{camera.privacyLabel}</small>{camera.provider==="custom"&&<><small className="model-diagnostic">{camera.diagnostic}</small>{camera.inferenceError&&<p role="alert" className="online-error">{camera.inferenceError} · ยังไม่นับท่าปิดผนึก</p>}</>}</>:<><div className="mouse-training"><MousePointer2 size={35}/><b>ลองต่อวงจรก่อนเปิดกล้อง</b><p>ลากเมาส์ผ่านจุด หรือแตะจุดเรียงลำดับ ใช้ Tab กับ Enter ได้ด้วย</p></div><p className="mouse-seal-label">จบเส้นแล้ว เลือกท่าที่คนกลางบอก</p><div className="seal-buttons">{GESTURES.map(g=><button key={g.id} disabled={!active||sending||visited.length<2} onClick={()=>cast(g.id,850)}><span>{g.symbol}</span>{g.name}</button>)}</div><small>โหมดนี้ใช้ปุ่มแทนการตรวจท่ามือ</small></>}
 </div></div><div className="trace-readout"><span>จุดที่ลาก</span><strong>{visited.length?visited.join(" · "):"—"}</strong><span className="trace-hint">{hint}</span></div>
 {mode==="camera"&&<div className="seal-hold"><div><span>{gesture?gesture.symbol+" "+gesture.name:"ท่าปิดผนึก: รอคำบอกจากคนกลาง"}</span><b>{Math.round(holding.value*100)}%</b></div><span className="seal-progress"><i style={{width:holding.value*100+"%"}}/></span></div>}
 {r.feedback&&<div role="status" className={"ritual-feedback "+r.feedback.kind}><Sparkles size={18}/>{r.feedback.text}</div>}
 </section>;
}
