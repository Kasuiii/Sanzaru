import { aslRequest } from "@/lib/asl-store";
import { AslError } from "@/lib/asl-engine";
import { aslFailure, aslHeaders, checkOrigin, limitedBody } from "@/lib/asl-http";
export async function POST(request: Request) {
    try {
        checkOrigin(request);
        const raw = new TextDecoder().decode(await limitedBody(request, 12000));
        let body;
        try {
            body = JSON.parse(raw);
        }
        catch {
            throw new AslError("คำขอต้องเป็น JSON");
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
            throw new AslError("คำขอไม่ถูกต้อง");
        return Response.json({ room: await aslRequest(body, request.headers.get("authorization")?.replace(/^Bearer /, "") || "") }, { headers: aslHeaders });
    }
    catch (e) {
        return aslFailure(e);
    }
}
