import { getAslVoice, saveAslVoice } from "@/lib/asl-store";
import { AslError } from "@/lib/asl-engine";
import { aslFailure, aslHeaders, checkOrigin, limitedBody } from "@/lib/asl-http";
export async function POST(request: Request) {
    try {
        checkOrigin(request);
        const bytes = await limitedBody(request, 280000);
        let form: FormData;
        try {
            form = await new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type") || "" }, body: bytes }).formData();
        }
        catch {
            throw new AslError("คำขอเสียงต้องเป็น multipart form");
        }
        const audio = form.get("audio");
        if (!(audio instanceof Blob))
            throw new AslError("ไม่พบข้อความเสียง");
        const room = await saveAslVoice(request.headers.get("authorization")?.replace(/^Bearer /, "") || "", form.get("code"), String(form.get("id") || ""), String(form.get("challenge") || ""), String(form.get("sourceId") || ""), audio);
        return Response.json({ room }, { headers: aslHeaders });
    }
    catch (e) {
        return aslFailure(e);
    }
}
export async function GET(request: Request) {
    try {
        const url = new URL(request.url), object = await getAslVoice(request.headers.get("authorization")?.replace(/^Bearer /, "") || "", url.searchParams.get("code"), url.searchParams.get("id") || "");
        return new Response(object.body, { headers: { ...aslHeaders, "Content-Type": object.httpMetadata?.contentType || "audio/webm" } });
    }
    catch (e) {
        return aslFailure(e);
    }
}
