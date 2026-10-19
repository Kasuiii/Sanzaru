import { ASL_ROLES, DEFAULT_LETTERS, isAslLetter, isAslRole, normalizeLetters, type AslRole, type AslMode } from "./asl-shared";
export class AslError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export type AslPlayer = {
    id: string;
    key: string;
    name: string;
    role: AslRole;
    ready: boolean;
    seen: string[];
    lastSeen: number;
    capabilities: string[];
    modelId: string;
};
export type AslSignal = {
    id: string;
    letter: string;
    confidence: number;
    at: number;
};
export type AslRelay = {
    id: string;
    letter: string;
    at: number;
    voice?: {
        id: string;
        mime: string;
    };
    sourceId: string;
};
export type AslResult = {
    stage: number;
    target: string;
    answer: string;
    sourceLetter: string;
    attempts: number;
    mode: AslMode;
};
export type AslEvent = {
    id: string;
    text: string;
    at: number;
};
export type AslState = {
    version: 1;
    code: string;
    hostId: string;
    players: AslPlayer[];
    phase: "lobby" | "playing" | "paused" | "won";
    mode: AslMode;
    letters: string[];
    targets: string[];
    stage: number;
    challenge: string;
    requested: boolean;
    requestId?: string;
    signal: AslSignal | null;
    relay: AslRelay | null;
    results: AslResult[];
    attempts: number;
    totalAttempts: number;
    startedAt: number;
    endedAt: number;
    pauseAt: number;
    pausedMs: number;
    events: AslEvent[];
    expiresAt: number;
    feedback: {
        id: string;
        correct: boolean;
        text: string;
    } | null;
};
export type AslAction = {
    id: string;
    type: string;
    [key: string]: unknown;
};
export function event(s: AslState, text: string, now: number) { s.events.push({ id: crypto.randomUUID(), text, at: now }); s.events = s.events.slice(-20); }
export function newAslPlayer(key: string, name: string, role: AslRole, now: number): AslPlayer { return { id: crypto.randomUUID(), key, name, role, ready: false, seen: [], lastSeen: now, capabilities: [], modelId: "" }; }
export function newAslRoom(code: string, p: AslPlayer, now: number, mode: AslMode = "ai"): AslState {
    return { version: 1, code, hostId: p.id, players: [p], phase: "lobby", mode, letters: [...DEFAULT_LETTERS], targets: [], stage: 0, challenge: "", requested: false, signal: null, relay: null, results: [], attempts: 0, totalAttempts: 0, startedAt: 0, endedAt: 0, pauseAt: 0, pausedMs: 0, events: [], expiresAt: now + 7200000, feedback: null };
}
function requireRole(p: AslPlayer, role: AslRole) { if (p.role !== role)
    throw new AslError("บทบาทนี้ไม่มีสิทธิ์ทำรายการนี้", 403); }
function nextChallenge(s: AslState) { s.challenge = crypto.randomUUID(); s.requested = false; s.requestId = ""; s.signal = null; s.relay = null; s.feedback = null; s.attempts = 0; }
function shuffle(letters: string[]) { const a = [...letters]; for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
} return a.slice(0, 5); }
function proof(a: AslAction, mode: AslMode, p: AslPlayer) {
    if (!isAslLetter(a.letter))
        throw new AslError("อักษรต้องอยู่ในชุด A–Z");
    if (a.source !== mode)
        throw new AslError("แหล่งคำตอบไม่ตรงกับโหมดของห้อง", 409);
    if (mode === "ai") {
        if (!p.capabilities.includes(a.letter as string))
            throw new AslError("โมเดลที่ยืนยันไว้ไม่รองรับอักษรนี้");
        if (a.modelId !== p.modelId)
            throw new AslError("โมเดลเปลี่ยนจากตอนกดพร้อม กลับไปเชื่อมโมเดลเดิม หรือกลับล็อบบีเพื่อเริ่มรอบใหม่", 409);
        if (typeof a.confidence !== "number" || !Number.isFinite(a.confidence) || a.confidence < .5 || a.confidence > 1 || typeof a.heldMs !== "number" || !Number.isFinite(a.heldMs) || a.heldMs < 900 || a.heldMs > 30000 || typeof a.sampleAgeMs !== "number" || !Number.isFinite(a.sampleAgeMs) || a.sampleAgeMs < 0 || a.sampleAgeMs > 1500)
            throw new AslError("รอให้อักษรนิ่งและผลโมเดลเป็นปัจจุบันก่อนยืนยัน");
    }
}
export function applyAslAction(s: AslState, p: AslPlayer, a: AslAction, now: number) {
    if (typeof a.id !== "string" || !/^[a-f0-9-]{36}$/.test(a.id) || typeof a.type !== "string")
        throw new AslError("รูปแบบคำสั่งไม่ถูกต้อง");
    if (p.seen.includes(a.id))
        return;
    const host = () => { if (s.hostId !== p.id)
        throw new AslError("ให้เจ้าของห้องทำรายการนี้", 403); };
    const lobby = () => { if (s.phase !== "lobby")
        throw new AslError("เปลี่ยนได้ก่อนเริ่มรอบเท่านั้น", 409); };
    const playing = () => { if (s.phase !== "playing")
        throw new AslError("รอเริ่มเกมหรือเล่นต่อก่อน", 409); if (a.challenge !== s.challenge)
        throw new AslError("ตราผนึกเปลี่ยนแล้ว กรุณาลองใหม่", 409); };
    switch (a.type) {
        case "settings": {
            host();
            lobby();
            if (a.mode !== "ai" && a.mode !== "practice")
                throw new AslError("โหมดไม่ถูกต้อง");
            let letters: string[];
            try {
                letters = normalizeLetters(a.letters);
            }
            catch (e) {
                throw new AslError((e as Error).message);
            }
            s.mode = a.mode;
            s.letters = letters;
            s.players.forEach(x => x.ready = false);
            break;
        }
        case "role": {
            lobby();
            if (!isAslRole(a.role) || s.players.some(x => x.id !== p.id && x.role === a.role))
                throw new AslError("บทบาทนี้มีผู้เล่นแล้ว", 409);
            p.role = a.role;
            s.players.forEach(x => x.ready = false);
            break;
        }
        case "rotate": {
            host();
            lobby();
            if (s.players.length !== 3)
                throw new AslError("รอผู้เล่นครบสามคน", 409);
            for (const x of s.players) {
                x.role = ASL_ROLES[(ASL_ROLES.findIndex(r => r.id === x.role) + 1) % 3].id;
                x.ready = false;
            }
            break;
        }
        case "ready": {
            lobby();
            if (typeof a.ready !== "boolean")
                throw new AslError("สถานะไม่ถูกต้อง");
            if (s.mode === "ai" && p.role !== "kikazaru" && a.ready) {
                const caps = a.capabilities;
                if (!Array.isArray(caps) || caps.some(x => !isAslLetter(x)) || !s.letters.every(l => caps.includes(l)))
                    throw new AslError("โมเดลต้องรองรับอักษรทุกตัวที่ห้องเลือก", 409);
                if (typeof a.modelId !== "string" || !/^[a-f0-9]{64}$/.test(a.modelId))
                    throw new AslError("ตรวจการเชื่อมต่อโมเดลก่อน", 409);
                p.capabilities = [...caps] as string[];
                p.modelId = a.modelId;
            }
            p.ready = a.ready;
            break;
        }
        case "start": {
            host();
            lobby();
            if (s.players.length !== 3 || new Set(s.players.map(x => x.role)).size !== 3 || s.players.some(x => !x.ready || now - x.lastSeen > 20000))
                throw new AslError("รอทั้งสามบทบาทเชื่อมต่อและกดพร้อม", 409);
            if (s.mode === "ai" && new Set(s.players.filter(x => x.role !== "kikazaru").map(x => x.modelId)).size !== 1)
                throw new AslError("Iwazaru และ Mizaru ต้องเชื่อมโมเดล ASL ชุดเดียวกัน", 409);
            s.phase = "playing";
            s.targets = shuffle(s.letters);
            s.stage = 0;
            s.results = [];
            s.events = [];
            s.totalAttempts = 0;
            s.startedAt = now;
            s.endedAt = 0;
            s.pausedMs = 0;
            nextChallenge(s);
            event(s, "พิธีเริ่มแล้ว เปิดตราผนึกทั้งห้าด้วยกัน", now);
            break;
        }
        case "ask": {
            playing();
            requireRole(p, "mizaru");
            event(s, "Mizaru พร้อมรับสาร ขอให้ Kikazaru ส่งคำขอไปยังผู้รู้", now);
            break;
        }
        case "request": {
            playing();
            requireRole(p, "kikazaru");
            s.requested = true;
            s.requestId = a.id;
            s.signal = null;
            s.relay = null;
            event(s, "Kikazaru ขออักษรของตราผนึกนี้จาก Iwazaru", now);
            break;
        }
        case "sign": {
            playing();
            requireRole(p, "iwazaru");
            if (!s.requested)
                throw new AslError("รอคำขอจาก Kikazaru ก่อน", 409);
            proof(a, s.mode, p);
            if (s.mode === "ai") {
                if (!s.requestId || a.requestId !== s.requestId)
                    throw new AslError("คำขอเปลี่ยนแล้ว รออ่านอักษรใหม่", 409);
                if (s.signal)
                    throw new AslError("ส่งอักษรสำหรับคำขอนี้แล้ว ให้ Kikazaru ขอใหม่หากต้องการทวน", 409);
                if ((a.confidence as number) <= .9 || (a.heldMs as number) < 3000)
                    throw new AslError("ถืออักษรเดิมที่มั่นใจเกิน 90% ต่อเนื่อง 3 วินาทีก่อนส่ง");
            }
            s.signal = { id: a.id, letter: a.letter as string, confidence: s.mode === "ai" ? a.confidence as number : 0, at: now };
            s.relay = null;
            event(s, "Iwazaru ส่งอักษรให้ Kikazaru แล้ว", now);
            break;
        }
        case "relay": {
            playing();
            requireRole(p, "kikazaru");
            if (!s.signal || a.sourceId !== s.signal.id)
                throw new AslError("อักษรต้นทางเปลี่ยนแล้ว กรุณาอ่านใหม่", 409);
            s.relay = { id: a.id, letter: s.signal.letter, sourceId: s.signal.id, at: now };
            event(s, "Kikazaru ส่งสารด้วยเสียงช่วยแล้ว", now);
            break;
        }
        case "answer": {
            playing();
            requireRole(p, "mizaru");
            if (!s.relay)
                throw new AslError("รอรับสารจาก Kikazaru ก่อนตอบ", 409);
            proof(a, s.mode, p);
            s.attempts++;
            s.totalAttempts++;
            const correct = a.letter === s.targets[s.stage];
            s.feedback = { id: a.id, correct, text: correct ? "ความหมายตรงกัน เปิดตราผนึกแล้ว" : "ยังไม่ตรงกัน ลองฟังหรือขอให้ส่งใหม่ได้ ไม่เสียสิทธิ์เล่น" };
            if (correct) {
                s.results.push({ stage: s.stage, target: s.targets[s.stage], answer: a.letter as string, sourceLetter: s.signal!.letter, attempts: s.attempts, mode: s.mode });
                s.stage++;
                event(s, "เปิดตราผนึกสำเร็จ " + s.stage + " จาก 5", now);
                if (s.stage === 5) {
                    s.phase = "won";
                    s.endedAt = now;
                }
                else
                    nextChallenge(s);
            }
            else
                event(s, "คำตอบยังไม่ตรง ทีมสามารถลองใหม่ได้", now);
            break;
        }
        case "pause": {
            if (s.phase !== "playing")
                throw new AslError("พักได้ระหว่างเล่น", 409);
            s.phase = "paused";
            s.pauseAt = now;
            event(s, p.name + " ขอพัก ทีมจะรอไปด้วยกัน", now);
            break;
        }
        case "resume": {
            if (s.phase !== "paused")
                throw new AslError("เกมไม่ได้พักอยู่", 409);
            if (s.players.length !== 3 || s.players.some(x => now - x.lastSeen > 20000))
                throw new AslError("รอผู้เล่นทั้งสามเชื่อมต่อก่อน", 409);
            s.pausedMs += now - s.pauseAt;
            s.phase = "playing";
            event(s, "ทุกคนพร้อม เล่นต่อได้", now);
            break;
        }
        case "rematch": {
            host();
            if (s.phase !== "won" && s.phase !== "paused")
                throw new AslError("จบรอบหรือพักก่อนกลับห้อง", 409);
            s.phase = "lobby";
            s.targets = [];
            s.results = [];
            s.events = [];
            s.stage = 0;
            s.signal = null;
            s.relay = null;
            s.feedback = null;
            s.players.forEach(x => x.ready = false);
            break;
        }
        case "leave": {
            s.players = s.players.filter(x => x.id !== p.id);
            if (s.hostId === p.id)
                s.hostId = s.players[0]?.id || "";
            if (s.phase === "playing") {
                s.phase = "paused";
                s.pauseAt = now;
            }
            s.players.forEach(x => x.ready = false);
            event(s, p.name + " ออกจากห้อง", now);
            break;
        }
        default: throw new AslError("ไม่รู้จักคำสั่ง");
    }
    p.seen.push(a.id);
    p.seen = p.seen.slice(-100);
    p.lastSeen = now;
}
export function aslView(s: AslState, selfId: string, revision: number, now: number) {
    const p = s.players.find(x => x.id === selfId);
    if (!p)
        throw new AslError("คุณไม่ได้อยู่ในห้องนี้", 401);
    const active = s.phase === "playing" || s.phase === "paused";
    const base = { version: 1 as const, code: s.code, revision, selfId, hostId: s.hostId, role: p.role, phase: s.phase, mode: s.mode, letters: s.letters, stage: s.stage, challenge: s.challenge, requested: s.requested, requestId: s.requestId || "",
        players: s.players.map(x => ({ id: x.id, name: x.name, role: x.role, ready: x.ready, online: now - x.lastSeen < 20000 })), events: s.events,
        elapsedMs: s.startedAt ? Math.max(0, (s.endedAt || (s.phase === "paused" ? s.pauseAt : now)) - s.startedAt - s.pausedMs) : 0,
        totalAttempts: s.totalAttempts, feedback: p.role === "mizaru" ? s.feedback : null, hasSignal: !!s.signal, hasRelay: !!s.relay };
    // Secret targets are never serialized to a relay or receiver, including pause and lobby.
    return { ...base, ...(p.role === "iwazaru" && active ? { target: s.targets[s.stage] } : {}),
        ...(p.role !== "mizaru" && active ? { signal: s.signal } : {}),
        ...(p.role === "mizaru" && active ? { relay: s.relay } : {}),
        ...(s.phase === "won" ? { results: s.results } : {}), seen: p.seen.slice(-10) };
}
export type AslView = ReturnType<typeof aslView>;
