"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {toast} from "sonner";
import type {PartyAction,PartyView} from "@/lib/party-engine";
type Session={code:string;token:string};
type Action=Omit<PartyAction,"seq">;
type APIError=Error&{status?:number};
const storageKey="portal-panic-online-session";
function secret(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,"0")).join("");}
async function request(token:string,body:unknown,signal?:AbortSignal){const r=await fetch("/api/party",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},body:JSON.stringify(body),cache:"no-store",signal});let data:{room?:PartyView;error?:string};try{data=await r.json() as {room?:PartyView;error?:string};}catch{throw Object.assign(new Error("เชื่อมต่อห้องไม่ได้ กรุณาลองอีกครั้ง"),{status:r.status});}if(!r.ok)throw Object.assign(new Error(data.error||"เชื่อมต่อห้องไม่ได้"),{status:r.status});if(!data.room)throw new Error("คำตอบจากห้องไม่สมบูรณ์");return data.room;}
export function useOnlineParty(){
 const [session,setSession]=useState<Session|null>(null),[room,setRoom]=useState<PartyView|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[connection,setConnection]=useState<"connecting"|"online"|"reconnecting">("connecting"),[latency,setLatency]=useState(0),[receivedAt,setReceivedAt]=useState(0);
 const activeRequest=useRef<Promise<PartyView>|null>(null);
 const queue=useRef<PartyAction[]>([]),seq=useRef(0),flushRef=useRef<()=>void>(()=>{}),roomRef=useRef<PartyView|null>(null),sessionRef=useRef(session),restored=useRef(false),leaving=useRef(false);
 sessionRef.current=session;roomRef.current=room;
 const saveSession=useCallback((s:Session|null)=>{try{if(s)sessionStorage.setItem(storageKey,JSON.stringify(s));else sessionStorage.removeItem(storageKey);}catch{}setSession(s);},[]);
 const forget=useCallback(()=>{saveSession(null);setRoom(null);queue.current=[];seq.current=0;setConnection("connecting");leaving.current=false;},[saveSession]);
 useEffect(()=>{if(restored.current)return;restored.current=true;try{const raw=sessionStorage.getItem(storageKey);if(raw){const s=JSON.parse(raw);if(/^[A-HJ-NP-Z2-9]{6}$/.test(s.code)&&/^[a-f0-9]{64}$/.test(s.token))setSession(s);}}catch{}},[]);
 const accept=useCallback((r:PartyView)=>{const p=r.players.find(p=>p.id===r.selfId);seq.current=Math.max(seq.current,p?.ack||0);queue.current=queue.current.filter(a=>a.seq>(p?.ack||0));roomRef.current=r;setRoom(r);setReceivedAt(Date.now());setConnection("online");setError("");},[]);
 useEffect(()=>{
  if(!session)return;let stopped=false,inflight=false,timer:ReturnType<typeof setTimeout>|undefined,controller:AbortController|undefined;
  const flush=async()=>{
   if(stopped||inflight||leaving.current)return;clearTimeout(timer);inflight=true;controller=new AbortController();const timeout=setTimeout(()=>controller?.abort(),7000),started=Date.now();
   try{const pending=request(session.token,{op:"sync",code:session.code,actions:queue.current.slice(0,16)},controller.signal);activeRequest.current=pending;const r=await pending;if(stopped)return;setLatency(Date.now()-started);accept(r);if(r.phase==="closed"){toast("เจ้าของห้องปิดห้องแล้ว");forget();return;}}
   catch(ex){if(stopped)return;const e=ex as APIError;if([401,404].includes(e.status||0)){setError(e.message);toast.error(e.message);forget();return;}if(e.status===400||e.status===403||e.status===409){queue.current=[];seq.current=roomRef.current?.players.find(p=>p.id===roomRef.current?.selfId)?.ack||0;toast.error(e.message);}else{setConnection("reconnecting");setError("การเชื่อมต่อสะดุด กำลังเชื่อมกลับ…");}}
   finally{activeRequest.current=null;clearTimeout(timeout);inflight=false;if(!stopped&&!leaving.current)timer=setTimeout(flush,queue.current.length?50:roomRef.current?.phase==="playing"||roomRef.current?.phase==="countdown"?300:850);}
  };
  flushRef.current=()=>{void flush();};void flush();
  const onOnline=()=>{void flush();};window.addEventListener("online",onOnline);
  return()=>{stopped=true;clearTimeout(timer);controller?.abort();window.removeEventListener("online",onOnline);flushRef.current=()=>{};};
 },[session,accept,forget]);
 const connect=useCallback(async(op:"create"|"join",input:{name:string;hero:number;mission?:number;code?:string})=>{
  if(sessionRef.current||busy)return;setBusy(true);setError("");const token=secret();
  try{const r=await request(token,{op,...input},AbortSignal.timeout(10000));queue.current=[];seq.current=0;leaving.current=false;accept(r);saveSession({code:r.code,token});toast.success(op==="create"?"สร้างห้องแล้ว ส่งรหัสให้เพื่อนได้เลย":"เข้าห้องแล้ว กดพร้อมเมื่อเตรียมตัวเสร็จ");}
  catch(e){setError((e as Error).message);toast.error((e as Error).message);}finally{setBusy(false);}
 },[accept,busy,saveSession]);
 const send=useCallback((action:Action)=>{if(!sessionRef.current||!roomRef.current||leaving.current)return;if(queue.current.length>=32){toast("กำลังรอการเชื่อมต่อ กรุณารอสักครู่");return;}queue.current.push({...action,seq:++seq.current});flushRef.current();},[]);
 const leave=useCallback(async()=>{const s=sessionRef.current;if(!s)return;leaving.current=true;setBusy(true);try{await activeRequest.current?.catch(()=>{});const r=await request(s.token,{op:"sync",code:s.code},AbortSignal.timeout(7000));const ack=r.players.find(p=>p.id===r.selfId)?.ack||0;await request(s.token,{op:"sync",code:s.code,actions:[{seq:ack+1,type:"leave"}]},AbortSignal.timeout(7000));forget();}catch(e){leaving.current=false;setError("ออกจากห้องไม่สำเร็จ ลองอีกครั้งเมื่อเชื่อมต่อได้");toast.error("ออกจากห้องไม่สำเร็จ ลองอีกครั้ง");flushRef.current();}finally{setBusy(false);}},[forget]);
 return{room,busy,error,connection,latency,receivedAt,restoring:!!session&&!room,connect,send,leave};
}
export type OnlineParty=ReturnType<typeof useOnlineParty>;
