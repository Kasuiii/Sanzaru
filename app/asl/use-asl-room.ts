"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AslView } from "@/lib/asl-engine";
import type { AslRole, AslMode } from "@/lib/asl-shared";
type Session = {
    code: string;
    token: string;
};
const key = "sanzaru-asl-session-v1";
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), x => x.toString(16).padStart(2, "0")).join("");
async function request(token: string, body: unknown) {
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 8000);
    try {
        const response = await fetch("/api/asl", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify(body), cache: "no-store", signal: abort.signal });
        const data = await response.json() as {
            error?: string;
            room: AslView | null;
        };
        if (!response.ok)
            throw Object.assign(new Error(data.error || "ติดต่อห้องไม่สำเร็จ"), { status: response.status });
        return data.room as AslView | null;
    }
    finally {
        clearTimeout(timer);
    }
}
export function useAslRoom() {
    const [room, setRoom] = useState<AslView | null>(null), [session, setSession] = useState<Session | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [connection, setConnection] = useState("connecting");
    const current = useRef<Session | null>(null), view = useRef<AslView | null>(null), mutating = useRef(false), generation = useRef(0);
    const accept = useCallback((next: AslView | null) => { if (next && current.current?.code === next.code && (!view.current || next.revision >= view.current.revision)) {
        view.current = next;
        setRoom(next);
        setConnection("online");
    } }, []);
    const forget = useCallback(() => { generation.current++; current.current = null; view.current = null; setSession(null); setRoom(null); setError(""); try {
        sessionStorage.removeItem(key);
    }
    catch { } }, []);
    useEffect(() => { try {
        const s = JSON.parse(sessionStorage.getItem(key) || "null");
        if (s && /^[A-HJ-NP-Z2-9]{6}$/.test(s.code) && /^[a-f0-9]{64}$/.test(s.token)) {
            current.current = s;
            setSession(s);
        }
    }
    catch { } }, []);
    useEffect(() => {
        if (!session)
            return;
        const gen = ++generation.current;
        let timer: ReturnType<typeof setTimeout>, cancelled = false;
        const poll = async () => { try {
            const next = await request(session.token, { op: "sync", code: session.code });
            if (!cancelled && gen === generation.current)
                accept(next);
        }
        catch (e) {
            if (!cancelled && gen === generation.current) {
                setConnection("reconnecting");
                if ([401, 404].includes((e as {
                    status: number;
                }).status)) {
                    forget();
                    setError((e as Error).message);
                }
            }
        }
        finally {
            if (!cancelled && gen === generation.current)
                timer = setTimeout(poll, 1400);
        } };
        void poll();
        return () => { cancelled = true; clearTimeout(timer); };
    }, [session, accept, forget]);
    const enter = useCallback(async (op: "create" | "join", name: string, role: AslRole, mode: AslMode, code = "") => {
        if (mutating.current)
            return;
        mutating.current = true;
        setBusy(true);
        setError("");
        const token = newToken();
        try {
            let next: AslView | null = null;
            for (let i = 0; i < 2; i++) {
                try {
                    next = await request(token, { op, name, role, mode, code });
                    break;
                }
                catch (e) {
                    if (i === 1 || (e as {
                        status: number;
                    }).status < 500)
                        throw e;
                }
            }
            if (!next)
                throw new Error("ไม่พบห้อง");
            const s = { code: next.code, token };
            current.current = s;
            view.current = null;
            setSession(s);
            try {
                sessionStorage.setItem(key, JSON.stringify(s));
            }
            catch { }
            accept(next);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "เข้าห้องไม่สำเร็จ");
        }
        finally {
            mutating.current = false;
            setBusy(false);
        }
    }, [accept]);
    const action = useCallback(async (type: string, values: Record<string, unknown> = {}) => {
        const s = current.current;
        if (!s || mutating.current)
            return false;
        mutating.current = true;
        setBusy(true);
        setError("");
        const action = { ...values, type, id: crypto.randomUUID() };
        try {
            let next: AslView | null = null;
            for (let i = 0; i < 3; i++) {
                try {
                    next = await request(s.token, { op: "action", code: s.code, action });
                    break;
                }
                catch (e) {
                    if (i === 2 || (e as {
                        status: number;
                    }).status < 500)
                        throw e;
                    await new Promise(resolve => setTimeout(resolve, 400 * (i + 1)));
                }
            }
            if (current.current !== s)
                return false;
            if (type === "leave")
                forget();
            else
                accept(next);
            return true;
        }
        catch (e) {
            setError(e instanceof Error ? (e.name === "AbortError" ? "การเชื่อมต่อช้า กรุณาลองอีกครั้ง" : e.message) : "ส่งคำสั่งไม่ได้");
            return false;
        }
        finally {
            mutating.current = false;
            setBusy(false);
        }
    }, [accept, forget]);
    const sendVoice = useCallback(async (blob: Blob, challenge: string, sourceId: string) => {
        const s = current.current;
        if (!s || mutating.current)
            return false;
        mutating.current = true;
        setBusy(true);
        setError("");
        const id = crypto.randomUUID();
        try {
            let next: AslView | null = null;
            for (let retry = 0; retry < 2; retry++) {
                const form = new FormData();
                form.set("code", s.code);
                form.set("id", id);
                form.set("challenge", challenge);
                form.set("sourceId", sourceId);
                form.set("audio", blob, "voice");
                const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
                try {
                    const response = await fetch("/api/asl/voice", { method: "POST", headers: { Authorization: "Bearer " + s.token }, body: form, signal: controller.signal }), data = await response.json() as {
                        error?: string;
                        room: AslView | null;
                    };
                    if (!response.ok)
                        throw Object.assign(new Error(data.error || "ส่งเสียงไม่สำเร็จ"), { status: response.status });
                    next = data.room;
                    break;
                }
                catch (e) {
                    if (retry === 1 || (e as {
                        status: number;
                    }).status < 500)
                        throw e;
                }
                finally {
                    clearTimeout(timer);
                }
            }
            if (current.current === s)
                accept(next);
            return true;
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "ส่งเสียงไม่สำเร็จ");
            return false;
        }
        finally {
            mutating.current = false;
            setBusy(false);
        }
    }, [accept]);
    const voiceBlob = useCallback(async (id: string) => { const s = current.current; if (!s)
        throw new Error("ไม่พบเซสชัน"); const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000); try {
        const r = await fetch("/api/asl/voice?code=" + encodeURIComponent(s.code) + "&id=" + encodeURIComponent(id), { headers: { Authorization: "Bearer " + s.token }, signal: controller.signal, cache: "no-store" });
        if (!r.ok)
            throw new Error("เปิดเสียงไม่ได้ กรุณาให้ Kikazaru ส่งใหม่");
        return await r.blob();
    }
    finally {
        clearTimeout(timer);
    } }, []);
    return { room, session, busy, error, connection, enter, action, forget, sendVoice, voiceBlob };
}
export type AslRoom = ReturnType<typeof useAslRoom>;
