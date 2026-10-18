"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {CUSTOM_FRAME_INTERVAL_MS,CUSTOM_MAX_AGE_MS,GestureFilter,freshCustom,handBounds,type CustomHealth,type GestureId} from "@/lib/gesture-inference";
import {checkGestureApi,predictGestureFrame,type CustomSettings} from "./custom-gesture-client";
export type HandSample={gesture:string;x:number;y:number;confidence:number;fingerX:number;fingerY:number;visible:boolean;at:number};
type Recognition={gestures:Array<Array<{categoryName:string;score:number}>>;landmarks:Array<Array<{x:number;y:number}>>};
type Recognizer={recognizeForVideo:(video:HTMLVideoElement,ts:number)=>Recognition;close:()=>void};
type Provider="mediapipe"|"custom";
const labels:Record<string,string>={Closed_Fist:"กำมือ · ชาร์จพลัง",Open_Palm:"แบมือ · ปล่อยพลัง",Victory:"ชูสองนิ้ว · ส่งให้เพื่อน",Thumb_Up:"ยกนิ้วโป้ง · กางโล่",Pointing_Up:"ชูนิ้วชี้ · ลากวงจร",None:"ยกมือให้อยู่ในกรอบ"};
const ritualLabels:Record<string,string>={Closed_Fist:"กำมือ · ท่าปิดผนึก",Open_Palm:"แบมือ · ท่าปิดผนึก",Victory:"ชูสองนิ้ว · ท่าปิดผนึก",Thumb_Up:"ยกนิ้วโป้ง · ท่าปิดผนึก",Pointing_Up:"ชูนิ้วชี้ · ลากวงจร",None:"ยกมือให้อยู่ในกรอบ"};
const blank=():HandSample=>({gesture:"None",x:.5,y:.5,confidence:0,fingerX:.5,fingerY:.5,visible:false,at:0});
const modelError=(e:unknown)=>e instanceof Error?(e.name==="AbortError"?"AI API ตอบช้าเกินไป ตรวจเซิร์ฟเวอร์และลดขนาดภาพถ้าจำเป็น":e.message==="Failed to fetch"?"ติดต่อ AI API ไม่ได้ ตรวจ URL, CORS, HTTPS และว่า Python server เปิดอยู่":e.message):"AI API ทำงานไม่สำเร็จ";
export function useHandCamera(mode:"classic"|"ritual"="classic"){
 const activeLabels=mode==="ritual"?ritualLabels:labels;
 const [status,setStatus]=useState("idle"),[error,setError]=useState(""),[gestureLabel,setGestureLabel]=useState(labels.None);
 const [provider,setProvider]=useState<Provider>("mediapipe"),[apiUrl,setApiUrl]=useState("http://127.0.0.1:8001"),[apiToken,setApiToken]=useState("");
 const [inferenceStatus,setInferenceStatus]=useState<"idle"|"checking"|"ready"|"error">("idle"),[inferenceError,setInferenceError]=useState(""),[modelInfo,setModelInfo]=useState<CustomHealth|null>(null),[diagnostic,setDiagnostic]=useState("");
 const streamRef=useRef<MediaStream|null>(null),modelRef=useRef<Recognizer|null>(null),captureRef=useRef<HTMLVideoElement|null>(null),displayRef=useRef<HTMLVideoElement|null>(null),rafRef=useRef(0),generation=useRef(0),requestRef=useRef<AbortController|null>(null);
 const sampleRef=useRef<HandSample>(blank());
 useEffect(()=>{if(mode!=="ritual")return;try{const stored=JSON.parse(localStorage.getItem("sanzaru-custom-model")||"null");if(stored?.provider==="custom")setProvider("custom");if(typeof stored?.url==="string")setApiUrl(stored.url.slice(0,500));}catch{}},[mode]);
 const attachVideo=useCallback((node:HTMLVideoElement|null)=>{displayRef.current=node;if(node&&streamRef.current){node.srcObject=streamRef.current;void node.play().catch(()=>{});}},[]);
 const cleanup=useCallback(()=>{
  generation.current++;cancelAnimationFrame(rafRef.current);requestRef.current?.abort();requestRef.current=null;
  streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;modelRef.current?.close();modelRef.current=null;
  if(captureRef.current){captureRef.current.srcObject=null;captureRef.current=null;}if(displayRef.current)displayRef.current.srcObject=null;sampleRef.current=blank();
 },[]);
 const stop=useCallback(()=>{cleanup();setStatus("idle");setGestureLabel(labels.None);setInferenceStatus("idle");setInferenceError("");setDiagnostic("");setModelInfo(null);},[cleanup]);
 useEffect(()=>cleanup,[cleanup]);
 const configure=useCallback((settings:{provider?:Provider;url?:string;token?:string})=>{
  stop();const p=settings.provider??provider,u=settings.url??apiUrl;if(mode==="ritual")setProvider(p);setApiUrl(u);if(settings.token!==undefined)setApiToken(settings.token);
  try{localStorage.setItem("sanzaru-custom-model",JSON.stringify({provider:p,url:u}));}catch{} // Token intentionally stays in memory only.
 },[stop,provider,apiUrl,mode]);
 const queryHealth=useCallback(async(token:number,settings:CustomSettings)=>{
  const controller=new AbortController();requestRef.current=controller;setInferenceStatus("checking");setInferenceError("");
  const timer=setTimeout(()=>controller.abort(),4000);
  try{const info=await checkGestureApi(settings,controller.signal);if(token===generation.current){setModelInfo(info);setInferenceStatus("ready");}return info;}
  finally{clearTimeout(timer);if(requestRef.current===controller)requestRef.current=null;}
 },[]);
 const checkModel=useCallback(async()=>{
  stop();const token=++generation.current;
  try{await queryHealth(token,{url:apiUrl,token:apiToken});}catch(e){if(token===generation.current){setInferenceStatus("error");setInferenceError(modelError(e));}}
 },[stop,queryHealth,apiUrl,apiToken]);
 const start=useCallback(async()=>{
  stop();const token=++generation.current;setError("");setStatus("loading");
  const custom=mode==="ritual"&&provider==="custom",settings={url:apiUrl,token:apiToken};
  let media:MediaStream|null=null,model:Recognizer|null=null;
  try{
   const info=custom?await queryHealth(token,settings):null;if(token!==generation.current)return;
   if(!navigator.mediaDevices?.getUserMedia)throw new Error("กล้องต้องเปิดผ่าน HTTPS หรือ localhost และเบราว์เซอร์ที่รองรับ");
   media=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480}},audio:false});
   if(token!==generation.current){media.getTracks().forEach(t=>t.stop());return;}streamRef.current=media;
   const video=document.createElement("video");video.muted=true;video.playsInline=true;video.srcObject=media;captureRef.current=video;await video.play();
   if(displayRef.current){displayRef.current.srcObject=media;void displayRef.current.play().catch(()=>{});}
   const moduleUrl="/vision/vision_bundle.mjs";
   const {FilesetResolver,GestureRecognizer}=await import(/* @vite-ignore */ moduleUrl);
   const vision=await FilesetResolver.forVisionTasks("/vision");
   model=await GestureRecognizer.createFromOptions(vision,{baseOptions:{modelAssetPath:"/vision/gesture_recognizer.task",delegate:"CPU"},runningMode:"VIDEO",numHands:1,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5,cannedGesturesClassifierOptions:{scoreThreshold:.55}});
   if(token!==generation.current){model?.close();media.getTracks().forEach(t=>t.stop());return;}modelRef.current=model;setStatus("ready");
   const nativeFilter=new GestureFilter(.55,180,500,mode==="classic"),customFilter=new GestureFilter(info?.confidence??.65),canvas=document.createElement("canvas");
   let external={gesture:"None" as GestureId,confidence:0,capturedAt:-Infinity},lastFrame=0,lastTime=-1,errors=0,lastRequest=-Infinity,inFlight=false,handEpoch=0,previousHand:{x:number;y:number}|null=null;
   const clearCustom=()=>{handEpoch++;external={gesture:"None",confidence:0,capturedAt:-Infinity};customFilter.reset();};
   const loop=(now:number)=>{
    if(token!==generation.current)return;
    if(now-lastFrame>85&&video.readyState>=2&&video.currentTime!==lastTime){
     lastFrame=now;lastTime=video.currentTime;
     try{
      const result=model!.recognizeForVideo(video,now),label=result.gestures?.[0]?.[0],points=result.landmarks?.[0],point=points?.[9],finger=points?.[8];
      const detected=point&&label&&label.score>=.55&&labels[label.categoryName]?label.categoryName:"None";
      const native=nativeFilter.observe(detected,label?.score||0,now),box=points?handBounds(points):null;
      if(!finger||!point||!box){clearCustom();previousHand=null;}else{if(previousHand&&Math.hypot(previousHand.x-point.x,previousHand.y-point.y)>.2)clearCustom();previousHand=point;}
      // Pointing_Up is reserved for drawing; custom models supply only seal gestures.
      if(custom&&detected==="Pointing_Up")clearCustom();
      if(custom&&info&&box&&detected!=="Pointing_Up"&&!inFlight&&now-lastRequest>=CUSTOM_FRAME_INTERVAL_MS){
       inFlight=true;lastRequest=now;const epoch=handEpoch,controller=new AbortController();requestRef.current=controller;const timer=setTimeout(()=>controller.abort(),1800);
       void predictGestureFrame(video,canvas,box,info,settings,controller.signal).then(prediction=>{
        if(token!==generation.current)return;
        setInferenceStatus("ready");setInferenceError("");setDiagnostic((prediction.className||"ไม่พบคลาส")+" · AI "+prediction.inferenceMs.toFixed(0)+" ms · ไปกลับ "+prediction.roundTripMs.toFixed(0)+" ms");
        if(epoch!==handEpoch)return;
        if(performance.now()-prediction.capturedAt>CUSTOM_MAX_AGE_MS){clearCustom();setDiagnostic("ผลทำนายล่าช้าเกิน "+CUSTOM_MAX_AGE_MS+" ms จึงไม่นับเป็นท่าปิดผนึก");return;}
        const filtered=customFilter.observe(prediction.gesture,prediction.confidence,prediction.capturedAt);external={...filtered,capturedAt:prediction.capturedAt};
       }).catch(e=>{if(token!==generation.current)return;clearCustom();setInferenceStatus("error");setInferenceError(modelError(e));}).finally(()=>{clearTimeout(timer);inFlight=false;if(requestRef.current===controller)requestRef.current=null;});
      }
      let gesture=native;
      if(custom)gesture=detected==="Pointing_Up"?native:freshCustom(external,now);
      if(!finger)gesture={gesture:"None",confidence:0};
      sampleRef.current={gesture:gesture.gesture,x:point?Math.max(.03,Math.min(.97,(1-point.x-.12)/.76)):.5,y:point?Math.max(.06,Math.min(.92,(point.y-.12)/.76)):.5,confidence:gesture.confidence,fingerX:finger?Math.max(0,Math.min(1,(1-finger.x-.08)/.84)):.5,fingerY:finger?Math.max(0,Math.min(1,(finger.y-.08)/.84)):.5,visible:!!finger,at:now};
      setGestureLabel(activeLabels[gesture.gesture]||activeLabels.None);errors=0;
     }catch{errors++;sampleRef.current=blank();nativeFilter.reset();clearCustom();if(errors>12){stop();setError("อ่านภาพไม่สำเร็จ ลองเปิดกล้องใหม่");setStatus("error");return;}}
    }
    rafRef.current=requestAnimationFrame(loop);
   };rafRef.current=requestAnimationFrame(loop);
  }catch(e){
   if(token!==generation.current)return;media?.getTracks().forEach(t=>t.stop());model?.close();streamRef.current=null;modelRef.current=null;if(captureRef.current)captureRef.current.srcObject=null;if(displayRef.current)displayRef.current.srcObject=null;
   const ex=e as Error;
   setError(ex.name==="NotAllowedError"?"อนุญาตการใช้กล้องในเบราว์เซอร์ แล้วลองอีกครั้ง":ex.name==="NotFoundError"?"ไม่พบกล้อง ลองต่อกล้องหรือเล่นด้วยเมาส์":ex.name==="NotReadableError"?"กล้องอาจใช้งานอยู่ในแอปอื่น ลองปิดแอปนั้นก่อน":custom?modelError(e):"เปิดกล้องไม่สำเร็จ ลองอีกครั้งหรือเล่นด้วยเมาส์");
   if(custom){setInferenceStatus("error");setInferenceError(modelError(e));}setStatus("error");
  }
 },[stop,activeLabels,mode,provider,apiUrl,apiToken,queryHealth]);
 const privacyLabel=mode==="ritual"&&provider==="custom"?"ภาพถูกส่งให้ Python AI API ที่คุณเลือก · ไม่ส่งให้เพื่อน":"ภาพกล้องประมวลผลบนเครื่องคุณ";
 return{status,error,gestureLabel,sampleRef,attachVideo,start,stop,streamRef,provider,apiUrl,apiToken,configure,checkModel,inferenceStatus,inferenceError,modelInfo,diagnostic,privacyLabel};
}
export type HandCamera=ReturnType<typeof useHandCamera>;
