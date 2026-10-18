import {normalizeApiUrl,readHealth,readPrediction,type CustomHealth,type HandBox} from "@/lib/gesture-inference";
export type CustomSettings={url:string;token:string};
async function readJson(response:Response):Promise<unknown>{
 let value:unknown;try{value=await response.json();}catch{throw new Error("API ไม่ได้ตอบ JSON ตรวจ URL, proxy และว่า Python server เปิดอยู่");}
 if(!response.ok){const v=value as Record<string,unknown>;throw new Error(typeof v.error==="string"?v.error:typeof v.detail==="string"?v.detail:"AI API ตอบ HTTP "+response.status);}
 return value;
}
export async function checkGestureApi(settings:CustomSettings,signal:AbortSignal):Promise<CustomHealth>{
 const base=normalizeApiUrl(settings.url,location.protocol),headers:Record<string,string>={};if(settings.token)headers.Authorization="Bearer "+settings.token;
 return readHealth(await readJson(await fetch(base+"/health",{headers,signal,cache:"no-store",credentials:"omit"})));
}
export async function predictGestureFrame(video:HTMLVideoElement,canvas:HTMLCanvasElement,box:HandBox,health:CustomHealth,settings:CustomSettings,signal:AbortSignal){
 if(!video.videoWidth||!video.videoHeight)throw new Error("ภาพกล้องยังไม่พร้อม");
 const crop=health.inputMode==="hand-crop",sx=crop?Math.floor(box.x1*video.videoWidth):0,sy=crop?Math.floor(box.y1*video.videoHeight):0;
 const sw=crop?Math.max(1,Math.ceil(box.x2*video.videoWidth)-sx):video.videoWidth,sh=crop?Math.max(1,Math.ceil(box.y2*video.videoHeight)-sy):video.videoHeight;
 const scale=Math.min(1,640/Math.max(sw,sh));canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
 const context=canvas.getContext("2d");if(!context)throw new Error("เบราว์เซอร์สร้างภาพส่งโมเดลไม่ได้");
 // Raw camera orientation, NOT the CSS-mirrored preview. No stale frame queue.
 context.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
 const capturedAt=performance.now();
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("สร้างภาพ JPEG ไม่สำเร็จ")),"image/jpeg",.78));
 if(signal.aborted)throw new DOMException("Cancelled","AbortError");
 const tracked=crop?{x1:0,y1:0,x2:1,y2:1}:box,url=new URL(normalizeApiUrl(settings.url,location.protocol)+"/predict");
 for(const [key,value] of Object.entries(tracked))url.searchParams.set(key,String(value));
 const headers:Record<string,string>={"Content-Type":"image/jpeg"};if(settings.token)headers.Authorization="Bearer "+settings.token;
 const result=readPrediction(await readJson(await fetch(url,{method:"POST",headers,body:blob,signal,cache:"no-store",credentials:"omit"})));
 return{...result,capturedAt,roundTripMs:performance.now()-capturedAt};
}
