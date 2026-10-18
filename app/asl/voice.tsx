"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Send, Volume2, Trash2, Play } from "lucide-react";
import type { AslRoom } from "./use-asl-room";
import { speakAloud, useAslAccess } from "./shell";
export function VoiceSender({ party }: {
    party: AslRoom;
}) {
    const room = party.room!, [recording, setRecording] = useState(false), [loading, setLoading] = useState(false), [seconds, setSeconds] = useState(0), [clip, setClip] = useState<{
        blob: Blob;
        challenge: string;
        sourceId: string;
    } | null>(null), [error, setError] = useState("");
    const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), timer = useRef<ReturnType<typeof setInterval> | null>(null), epoch = useRef(0);
    const cleanup = () => { epoch.current++; if (timer.current)
        clearInterval(timer.current); if (recorder.current && recorder.current.state !== "inactive") {
        recorder.current.onstop = null;
        recorder.current.stop();
    } stream.current?.getTracks().forEach(t => t.stop()); recorder.current = null; stream.current = null; };
    useEffect(() => { cleanup(); setClip(null); setRecording(false); setLoading(false); setSeconds(0); return cleanup; }, [room.challenge, room.phase]);
    async function start() {
        if (!room.signal)
            return;
        setError("");
        setLoading(true);
        setClip(null);
        const currentEpoch = ++epoch.current, challenge = room.challenge, sourceId = room.signal.id;
        try {
            if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
                throw new Error("เบราว์เซอร์นี้อัดเสียงไม่ได้ ใช้ปุ่มเสียงช่วยได้");
            const media = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (currentEpoch !== epoch.current) {
                media.getTracks().forEach(t => t.stop());
                return;
            }
            stream.current = media;
            const mime = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find(v => MediaRecorder.isTypeSupported(v));
            if (!mime)
                throw new Error("ไม่มีรูปแบบอัดเสียงที่รองรับ ใช้เสียงช่วยแทนได้");
            const r = new MediaRecorder(media, { mimeType: mime, audioBitsPerSecond: 24000 }), chunks: Blob[] = [];
            recorder.current = r;
            r.ondataavailable = e => { if (e.data.size)
                chunks.push(e.data); };
            r.onerror = () => { cleanup(); setRecording(false); setLoading(false); setError("อัดเสียงไม่ได้ ลองใหม่หรือใช้เสียงช่วย"); };
            r.onstop = () => { media.getTracks().forEach(t => t.stop()); if (timer.current)
                clearInterval(timer.current); if (currentEpoch !== epoch.current)
                return; setRecording(false); const blob = new Blob(chunks, { type: mime }); if (blob.size < 100 || blob.size > 256000)
                setError("เสียงสั้นหรือใหญ่เกินไป กรุณาอัดใหม่");
            else
                setClip({ blob, challenge, sourceId }); };
            r.start();
            setSeconds(0);
            setRecording(true);
            let count = 0;
            timer.current = setInterval(() => { count++; setSeconds(count); if (count >= 8 && r.state === "recording")
                r.stop(); }, 1000);
        }
        catch (e) {
            cleanup();
            setRecording(false);
            setLoading(false);
            setError(e instanceof Error ? e.message : "เปิดไมโครโฟนไม่ได้");
        }
        finally {
            if (currentEpoch === epoch.current)
                setLoading(false);
        }
    }
    return <div className="asl-voice-sender"><p>พูดชื่ออักษรให้ชัด เช่น “ตัว A” แล้วส่งเสียงให้ Mizaru</p><div className={"asl-wave " + (recording ? "recording" : "")} aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ height: 12 + (i * 17 % 32), animationDelay: i * .04 + "s" }}/>)}</div>
    {recording ? <button className="asl-button danger" onClick={() => recorder.current?.stop()}><Square size={16}/>หยุดอัด · {seconds}/8 วินาที</button> : <button className="asl-button" onClick={() => void start()} disabled={!room.signal || party.busy || loading}><Mic size={17}/>{loading ? "รอสิทธิ์ไมโครโฟน…" : clip ? "อัดใหม่" : "อัดเสียงคำตอบ"}</button>}
    {clip && <div className="asl-actions"><button className="asl-button" disabled={party.busy} onClick={async () => { if (await party.sendVoice(clip.blob, clip.challenge, clip.sourceId))
        setClip(null); }}><Send size={16}/>ส่งเสียงให้ Mizaru</button><button className="asl-icon-button" aria-label="ลบเสียงที่ยังไม่ส่ง" onClick={() => setClip(null)}><Trash2 size={17}/></button></div>}
    <button className="asl-button secondary" disabled={!room.signal || party.busy || recording || loading} onClick={() => void party.action("relay", { challenge: room.challenge, sourceId: room.signal?.id })}><Volume2 size={17}/>ส่งด้วยเสียงช่วย</button><small>เสียงช่วยจะอ่านอักษรที่คุณเห็นบนเครื่องของ Mizaru โดยไม่ต้องใช้ไมโครโฟน</small>
    {room.hasRelay && <p className="asl-success" role="status">ส่งสารแล้ว รอ Mizaru ตอบ หรือส่งใหม่ได้</p>}{error && <p className="asl-error" role="alert">{error}</p>}
  </div>;
}
export function VoiceReceiver({ party }: {
    party: AslRoom;
}) {
    const relay = party.room?.relay, { preferences } = useAslAccess(), [error, setError] = useState(""), [loading, setLoading] = useState(false), audio = useRef<HTMLAudioElement | null>(null), blobUrl = useRef(""), generation = useRef(0);
    useEffect(() => { generation.current++; setError(""); setLoading(false); audio.current?.pause(); if (audio.current)
        audio.current.removeAttribute("src"); if (blobUrl.current)
        URL.revokeObjectURL(blobUrl.current); blobUrl.current = ""; if ("speechSynthesis" in window)
        window.speechSynthesis.cancel(); return () => { generation.current++; audio.current?.pause(); if (blobUrl.current)
        URL.revokeObjectURL(blobUrl.current); if ("speechSynthesis" in window)
        window.speechSynthesis.cancel(); }; }, [relay?.id]);
    async function play() {
        if (!relay)
            return;
        setError("");
        if (!relay.voice) {
            if (!speakAloud("Letter " + relay.letter, "en-US"))
                setError("ไม่มีเสียงอ่านในเบราว์เซอร์นี้ เปิดอักษรประกอบเสียงในเมนูการเข้าถึงได้");
            return;
        }
        const gen = generation.current;
        setLoading(true);
        try {
            if (!blobUrl.current) {
                const blob = await party.voiceBlob(relay.voice.id);
                if (gen !== generation.current)
                    return;
                blobUrl.current = URL.createObjectURL(blob);
            }
            if (audio.current) {
                audio.current.src = blobUrl.current;
                await audio.current.play();
            }
        }
        catch (e) {
            if (gen === generation.current)
                setError(e instanceof Error ? e.message : "เปิดเสียงไม่ได้");
        }
        finally {
            if (gen === generation.current)
                setLoading(false);
        }
    }
    return <div className="asl-voice-receiver"><span className="asl-audio-orbit" aria-hidden="true"><Volume2 size={31}/></span><h3>{relay ? "สารจาก Kikazaru มาถึงแล้ว" : "กำลังรอสารจาก Kikazaru"}</h3><p>{relay ? "ฟังให้ชัด ทำอักษรตามที่ได้ยิน แล้วกดยืนยัน" : "คุณไม่เห็นเฉลย แต่ถามซ้ำและฟังซ้ำได้เสมอ"}</p><button className="asl-button" disabled={!relay || loading} onClick={() => void play()}><Play size={17}/>{loading ? "กำลังโหลดเสียง…" : "ฟัง / ฟังอีกครั้ง"}</button>{relay?.voice && <audio ref={audio} controls preload="none" aria-label="ข้อความเสียงจาก Kikazaru"/>}
    {relay && preferences.captions && <p className="asl-caption">อักษรประกอบเสียง: <strong>{relay.letter}</strong><small>มาจากอักษรที่คนกลางเลือกส่ง ไม่ใช่การถอดเสียงอัตโนมัติ</small></p>}
    {error && <p className="asl-error" role="alert">{error}</p>}
  </div>;
}
