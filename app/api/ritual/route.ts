import {ritualRequest} from "@/lib/ritual-store";
import {RitualError} from "@/lib/ritual-engine";
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 try{
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)throw new RitualError("คำขอข้ามเว็บไซต์ไม่ถูกต้อง",403);
  if(Number(request.headers.get("content-length"))>40000)throw new RitualError("คำขอใหญ่เกินไป",413);
  const raw=await request.text();if(raw.length>40000)throw new RitualError("คำขอใหญ่เกินไป",413);
  let body;try{body=JSON.parse(raw);}catch{throw new RitualError("คำขอไม่ถูกต้อง");}if(!body||typeof body!=="object"||Array.isArray(body))throw new RitualError("คำขอไม่ถูกต้อง");
  return Response.json({room:await ritualRequest(body,request.headers.get("authorization")?.replace(/^Bearer /,"")||"")},{headers});
 }catch(e){if(e instanceof RitualError)return Response.json({error:e.message},{status:e.status,headers});console.error("ritual request failed",e instanceof Error?e.message:String(e));return Response.json({error:"เชื่อมต่อห้องไม่ได้ กำลังลองใหม่"},{status:503,headers});}
}
