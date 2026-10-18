import { env } from "cloudflare:workers";
import { ASL_ROLES, isAslRole, type AslMode } from "./asl-shared";
import { AslError, applyAslAction, aslView, event, newAslPlayer, newAslRoom, type AslAction, type AslPlayer, type AslState } from "./asl-engine";
type Row = {
    code: string;
    state: string;
    revision: number;
    expires_at: number;
};
function db() { if (!env.DB)
    throw new Error("ASL database binding DB unavailable"); return env.DB; }
function bucket() { if (!env.BUCKET)
    throw new Error("ASL voice binding BUCKET unavailable"); return env.BUCKET; }
function roomCode(v: unknown) { const c = typeof v === "string" ? v.trim().toUpperCase() : ""; if (!/^[A-HJ-NP-Z2-9]{6}$/.test(c))
    throw new AslError("รหัสห้องต้องมี 6 ตัว"); return c; }
function playerName(v: unknown) { if (typeof v !== "string" || !v.trim() || v.trim().length > 24)
    throw new AslError("ใส่ชื่อ 1–24 ตัวอักษร"); return v.trim(); }
async function tokenKey(token: string) { if (!/^[a-f0-9]{64}$/.test(token))
    throw new AslError("สิทธิ์เข้าห้องไม่ถูกต้อง", 401); return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))), n => n.toString(16).padStart(2, "0")).join(""); }
async function read(code: string) { const row = await db().prepare("SELECT code,state,revision,expires_at FROM asl_rooms WHERE code=?").bind(code).first<Row>(); if (!row || row.expires_at <= Date.now())
    throw new AslError("ไม่พบห้อง หรือห้องไม่ได้ใช้งานนานเกิน 2 ชั่วโมงแล้ว", 404); return { row, state: JSON.parse(row.state) as AslState }; }
async function mutate(code: string, key: string, fn: (s: AslState, p: AslPlayer | undefined, now: number) => void) {
    for (let i = 0; i < 8; i++) {
        const { row, state } = await read(code), now = Date.now(), before = state.players.find(x => x.key === key);
        fn(state, before, now);
        state.expiresAt = now + 7200000;
        const result = await db().prepare("UPDATE asl_rooms SET state=?,revision=revision+1,expires_at=? WHERE code=? AND revision=?").bind(JSON.stringify(state), state.expiresAt, code, row.revision).run();
        if (result.meta.changes === 1) {
            const p = state.players.find(x => x.key === key);
            return p ? aslView(state, p.id, row.revision + 1, now) : null;
        }
    }
    throw new AslError("ห้องกำลังซิงก์ กรุณาลองใหม่", 503);
}
export async function aslRequest(body: Record<string, unknown>, token: string) {
    const key = await tokenKey(token), now = Date.now();
    if (body.op === "create") {
        const name = playerName(body.name), role = isAslRole(body.role) ? body.role : "iwazaru", mode: AslMode = body.mode === "practice" ? "practice" : "ai";
        const old = await db().prepare("SELECT code,state,revision,expires_at FROM asl_rooms WHERE owner_key=?").bind(key).first<Row>();
        if (old && old.expires_at > now) {
            const s = JSON.parse(old.state) as AslState, p = s.players.find(x => x.key === key);
            if (p)
                return aslView(s, p.id, old.revision, now);
            throw new AslError("เซสชันเก่าจบแล้ว กรุณาออกจากห้องก่อนสร้างใหม่", 409);
        }
        const expired = await db().prepare("SELECT code,state,revision,expires_at FROM asl_rooms WHERE expires_at<=? LIMIT 10").bind(now).all<Row>();
        for (const row of expired.results || []) {
            if (env.BUCKET) {
                const files = await env.BUCKET.list({ prefix: "asl/" + row.code + "/", limit: 1000 });
                if (files.objects.length)
                    await env.BUCKET.delete(files.objects.map(x => x.key));
            }
            await db().prepare("DELETE FROM asl_rooms WHERE code=? AND expires_at<=?").bind(row.code, now).run();
        }
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (let i = 0; i < 5; i++) {
            const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), n => alphabet[n % alphabet.length]).join(""), p = newAslPlayer(key, name, role, now), s = newAslRoom(code, p, now, mode);
            const result = await db().prepare("INSERT OR IGNORE INTO asl_rooms(code,owner_key,state,revision,expires_at) VALUES(?,?,?,0,?)").bind(code, key, JSON.stringify(s), s.expiresAt).run();
            if (result.meta.changes === 1)
                return aslView(s, p.id, 0, now);
        }
        throw new AslError("สร้างห้องไม่สำเร็จ กรุณาลองใหม่", 503);
    }
    const code = roomCode(body.code);
    if (body.op === "sync") {
        const { row, state } = await read(code), p = state.players.find(x => x.key === key);
        if (!p)
            throw new AslError("คุณไม่ได้อยู่ในห้องนี้", 401);
        if (now - p.lastSeen < 4000)
            return aslView(state, p.id, row.revision, now);
        return mutate(code, key, (_s, player, at) => { if (!player)
            throw new AslError("คุณไม่ได้อยู่ในห้องนี้", 401); player.lastSeen = at; });
    }
    if (body.op !== "join" && body.op !== "action")
        throw new AslError("คำขอไม่ถูกต้อง");
    return mutate(code, key, (s, p, at) => {
        if (body.op === "join") {
            if (p) {
                p.lastSeen = at;
                return;
            }
            if (s.players.length >= 3)
                throw new AslError("ห้องเต็มแล้ว รับได้ 3 คน", 409);
            if (s.phase !== "lobby")
                throw new AslError("ให้เจ้าของห้องกลับล็อบบีก่อนรับผู้เล่นใหม่", 409);
            const role = isAslRole(body.role) && !s.players.some(x => x.role === body.role) ? body.role : ASL_ROLES.find(r => !s.players.some(x => x.role === r.id))!.id;
            s.players.push(newAslPlayer(key, playerName(body.name), role, at));
            s.players.forEach(x => x.ready = false);
            return;
        }
        if (!p)
            throw new AslError("คุณไม่ได้อยู่ในห้องนี้", 401);
        const action = body.action;
        if (!action || typeof action !== "object" || Array.isArray(action))
            throw new AslError("คำสั่งไม่ถูกต้อง");
        applyAslAction(s, p, action as AslAction, at);
    });
}
export async function saveAslVoice(token: string, codeInput: unknown, id: string, challenge: string, sourceId: string, audio: Blob) {
    const key = await tokenKey(token), code = roomCode(codeInput), mime = audio.type.split(";")[0];
    if (!/^[a-f0-9-]{36}$/.test(id) || !["audio/webm", "audio/ogg", "audio/mp4"].includes(mime) || audio.size < 100 || audio.size > 256000)
        throw new AslError("ใช้เสียงสั้นไม่เกิน 256 KB ในรูปแบบที่รองรับ");
    const first = await read(code), p = first.state.players.find(x => x.key === key);
    if (!p || p.role !== "kikazaru")
        throw new AslError("เฉพาะ Kikazaru ส่งเสียงให้ Mizaru ได้", 403);
    if (p.seen.includes(id))
        return aslView(first.state, p.id, first.row.revision, Date.now());
    if (first.state.phase !== "playing" || first.state.challenge !== challenge || first.state.signal?.id !== sourceId)
        throw new AslError("ตราผนึกหรืออักษรเปลี่ยนแล้ว กรุณาอัดเสียงใหม่", 409);
    const objectKey = "asl/" + code + "/" + id;
    await bucket().put(objectKey, await audio.arrayBuffer(), { httpMetadata: { contentType: mime } });
    try {
        return await mutate(code, key, (s, player, at) => {
            if (!player || player.role !== "kikazaru")
                throw new AslError("ไม่มีสิทธิ์ส่งเสียง", 403);
            if (player.seen.includes(id))
                return;
            if (s.phase !== "playing" || s.challenge !== challenge || s.signal?.id !== sourceId)
                throw new AslError("อักษรเปลี่ยนแล้ว กรุณาอัดใหม่", 409);
            s.relay = { id, sourceId, letter: s.signal.letter, at, voice: { id, mime } };
            player.seen.push(id);
            player.seen = player.seen.slice(-100);
            event(s, "Kikazaru ส่งข้อความเสียงให้ Mizaru แล้ว", at);
        });
    }
    catch (e) {
        await bucket().delete(objectKey);
        throw e;
    }
}
export async function getAslVoice(token: string, codeInput: unknown, id: string) {
    const key = await tokenKey(token), code = roomCode(codeInput), { state } = await read(code), p = state.players.find(x => x.key === key);
    if (!p || p.role !== "mizaru" || state.relay?.voice?.id !== id)
        throw new AslError("ไม่มีสิทธิ์ฟังเสียงนี้ หรือเป็นเสียงของด่านก่อน", 403);
    const object = await bucket().get("asl/" + code + "/" + id);
    if (!object)
        throw new AslError("ไม่พบข้อความเสียง", 404);
    return object;
}
