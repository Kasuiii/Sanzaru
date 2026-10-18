import {partyRequest} from "@/lib/party-store";
import {PartyError} from "@/lib/party-engine";
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 try{
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)return Response.json({error:"ไม่อนุญาตคำขอจากเว็บไซต์อื่น"},{status:403,headers});
  if(Number(request.headers.get("content-length"))>12000)throw new PartyError("คำขอใหญ่เกินไป",413);
  const raw=await request.text();if(raw.length>12000)throw new PartyError("คำขอใหญ่เกินไป",413);
  let body;try{body=JSON.parse(raw);}catch{throw new PartyError("คำขอไม่ถูกต้อง");}
  if(!body||typeof body!=="object"||Array.isArray(body))throw new PartyError("คำขอไม่ถูกต้อง");
  const token=request.headers.get("authorization")?.replace(/^Bearer /,"")||"";
  return Response.json({room:await partyRequest(body,token)},{headers});
 }catch(e){if(e instanceof PartyError)return Response.json({error:e.message},{status:e.status,headers});console.error("party request failed",e instanceof Error?e.message:String(e));return Response.json({error:"เชื่อมต่อห้องไม่ได้ กำลังลองใหม่ กรุณารอสักครู่"},{status:503,headers});}
}
