import { AslError } from "./asl-engine";
export const aslHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export function checkOrigin(request: Request) { const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin)
    throw new AslError("คำขอข้ามเว็บไซต์ไม่ถูกต้อง", 403); }
export async function limitedBody(request: Request, max: number) {
    if (Number(request.headers.get("content-length")) > max)
        throw new AslError("คำขอใหญ่เกินไป", 413);
    const reader = request.body?.getReader();
    if (!reader)
        return new Uint8Array();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.length;
            if (size > max) {
                await reader.cancel();
                throw new AslError("คำขอใหญ่เกินไป", 413);
            }
            parts.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.length;
    }
    return result;
}
export function aslFailure(e: unknown) { if (e instanceof AslError)
    return Response.json({ error: e.message }, { status: e.status, headers: aslHeaders }); console.error("ASL API failed", e instanceof Error ? e.message : String(e)); return Response.json({ error: "เชื่อมต่อห้องไม่ได้ ตรวจเซิร์ฟเวอร์แล้วลองอีกครั้ง" }, { status: 503, headers: aslHeaders }); }
