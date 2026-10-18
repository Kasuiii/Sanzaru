import {readRitualVoice,storeRitualVoice} from "@/lib/ritual-store";
import {RitualError} from "@/lib/ritual-engine";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
function failure(e:unknown){if(e instanceof RitualError)return Response.json({error:e.message},{status:e.status,headers});console.error("ritual voice failed",e instanceof Error?e.message:String(e));return Response.json({error:"ส่งหรือฟังเสียงไม่สำเร็จ ลองอีกครั้ง"},{status:503,headers});}
export async function POST(request:Request){try{
 const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)throw new RitualError("คำขอข้ามเว็บไซต์ไม่ถูกต้อง",403);
 if(Number(request.headers.get("content-length"))>280000)throw new RitualError("เสียงยาวเกินไป",413);const bytes=await request.arrayBuffer();if(bytes.byteLength>280000)throw new RitualError("เสียงยาวเกินไป",413);
 const form=await new Request(request.url,{method:"POST",headers:{"Content-Type":request.headers.get("content-type")||""},body:bytes}).formData(),audio=form.get("audio");if(!(audio instanceof Blob))throw new RitualError("ไม่พบข้อความเสียง");
 const room=await storeRitualVoice(request.headers.get("authorization")?.replace(/^Bearer /,"")||"",form.get("code"),form.get("to"),String(form.get("id")||""),audio);return Response.json({room},{headers});
 }catch(e){return failure(e);}}
export async function GET(request:Request){try{const url=new URL(request.url),audio=await readRitualVoice(request.headers.get("authorization")?.replace(/^Bearer /,"")||"",url.searchParams.get("code"),url.searchParams.get("id")||"");return new Response(audio.body,{headers:{...headers,"Content-Type":audio.httpMetadata?.contentType||"audio/webm"}});}catch(e){return failure(e);}}
