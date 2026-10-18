"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { handBounds } from "@/lib/gesture-inference";
import { AslStabilizer, emptyAslSample, sampleProof, type AslHealth } from "@/lib/asl-inference";
import { AslBrowserModel, type BrowserProvider } from "@/lib/asl-browser-model";

type Recognizer = {
    recognizeForVideo: (video: HTMLVideoElement, timestamp: number) => { landmarks: { x: number; y: number }[][] };
    close: () => void;
};
function errorText(error: unknown) {
    if (error instanceof Error) {
        if (error.name === "NotAllowedError") return "ยังไม่ได้อนุญาตกล้อง เปิดสิทธิ์กล้องแล้วลองใหม่";
        if (error.name === "NotFoundError") return "ไม่พบกล้องที่ใช้งานได้";
        if (error.message === "Failed to fetch") return "ดาวน์โหลดโมเดลหรือ runtime ไม่ได้ ตรวจไฟล์ HTTPS และ CORS ของที่เก็บโมเดล";
        return error.message;
    }
    return "เปิดกล้องหรือโมเดลไม่สำเร็จ";
}
export function useAslCamera() {
    const [url, setUrl] = useState("/models/asl/manifest.json"), [provider, setProvider] = useState<BrowserProvider>("auto");
    const [backend, setBackend] = useState(""), [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [error, setError] = useState(""), [health, setHealth] = useState<AslHealth | null>(null);
    const [sample, setSample] = useState(emptyAslSample), [hint, setHint] = useState("เปิดกล้องเมื่อพร้อม"), [latency, setLatency] = useState(0);
    const [timing, setTiming] = useState({ handMs: 0, preprocessMs: 0, inferenceMs: 0 });
    const [diagnostic, setDiagnostic] = useState("");
    const stream = useRef<MediaStream | null>(null), tracker = useRef<Recognizer | null>(null), model = useRef<AslBrowserModel | null>(null);
    const video = useRef<HTMLVideoElement | null>(null), display = useRef<HTMLVideoElement | null>(null), generation = useRef(0), raf = useRef(0);
    const current = useRef(emptyAslSample()), resetObservation = useRef<(() => void) | null>(null);
    useEffect(() => { try {
        const value = localStorage.getItem("sanzaru-asl-onnx");
        // Hydrate browser-only preferences after the matching server/client render.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (value) { const saved = JSON.parse(value); if (typeof saved.url === "string") setUrl(saved.url.slice(0, 500)); if (saved.provider === "wasm") setProvider("wasm"); }
    } catch {} }, []);
    const clean = useCallback(() => {
        generation.current++; cancelAnimationFrame(raf.current); resetObservation.current = null;
        model.current?.close(); model.current = null;
        stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
        tracker.current?.close(); tracker.current = null;
        if (video.current) video.current.srcObject = null;
        video.current = null;
        if (display.current) display.current.srcObject = null;
        current.current = emptyAslSample();
    }, []);
    const stop = useCallback(() => {
        clean(); setStatus("idle"); setSample(emptyAslSample()); setHealth(null); setBackend(""); setLatency(0); setDiagnostic(""); setTiming({ handMs: 0, preprocessMs: 0, inferenceMs: 0 }); setHint("กล้องปิดอยู่"); setError("");
    }, [clean]);
    useEffect(() => clean, [clean]);
    const attach = useCallback((node: HTMLVideoElement | null) => {
        display.current = node;
        if (node && stream.current) { node.srcObject = stream.current; void node.play().catch(() => {}); }
    }, []);
    const configure = useCallback((value: string, nextProvider: BrowserProvider) => {
        stop(); setUrl(value); setProvider(nextProvider);
        try { localStorage.setItem("sanzaru-asl-onnx", JSON.stringify({ url: value, provider: nextProvider })); } catch {}
    }, [stop]);
    const start = useCallback(async () => {
        stop(); const gen = ++generation.current;
        setStatus("loading"); setHint("กำลังเตรียมโมเดลในเครื่องคุณ");
        let acquired: MediaStream | null = null, recognizer: Recognizer | null = null;
        const active = () => gen === generation.current;
        try {
            if (!navigator.mediaDevices?.getUserMedia || !globalThis.isSecureContext) throw new Error("กล้องและโมเดลต้องใช้งานผ่าน HTTPS หรือ localhost");
            if (!globalThis.Worker || !globalThis.OffscreenCanvas || !globalThis.createImageBitmap) throw new Error("เบราว์เซอร์นี้ไม่รองรับ Worker/OffscreenCanvas กรุณาใช้เบราว์เซอร์รุ่นใหม่");
            const engine = new AslBrowserModel(message => { if (active()) setHint(message); });
            model.current = engine;
            const info = await engine.load(new URL(url, location.href).href, provider);
            if (!active()) return;
            setHint("โมเดลพร้อมแล้ว กำลังเปิดกล้อง");
            acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
            if (!active()) { acquired.getTracks().forEach(track => track.stop()); return; }
            stream.current = acquired;
            const capture = document.createElement("video");
            capture.muted = true; capture.playsInline = true; capture.srcObject = acquired; video.current = capture;
            await capture.play();
            if (!active()) return;
            const path = "/vision/vision_bundle.mjs", { FilesetResolver, GestureRecognizer } = await import(/* @vite-ignore */ path);
            const vision = await FilesetResolver.forVisionTasks("/vision");
            if (!active()) return;
            recognizer = await GestureRecognizer.createFromOptions(vision, { baseOptions: { modelAssetPath: "/vision/gesture_recognizer.task", delegate: "CPU" }, runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 });
            if (!active()) { recognizer!.close(); return; }
            tracker.current = recognizer;
            for (const track of acquired.getVideoTracks()) track.onended = () => { if (active()) stop(); };
            if (display.current) { display.current.srcObject = acquired; void display.current.play().catch(() => {}); }
            setHealth(info.health); setBackend(info.provider === "webgpu" ? "WebGPU" : `WASM · CPU ${info.threads} เธรด${info.fallback ? " (สำรอง)" : ""}`);
            setDiagnostic(`${capture.videoWidth}×${capture.videoHeight} · โมเดล ${info.inputSize} · ${info.health.inputMode === "hand-crop" ? "ขยายบริเวณมือ" : "เต็มภาพ"} · เกณฑ์ ${Math.round(info.health.confidence * 100)}% · ${info.mirror ? "กลับภาพก่อนอ่าน" : "ไม่กลับภาพ"}${info.provider === "wasm" && !info.isolated ? " · ยังใช้หลายเธรดไม่ได้: ตรวจ COOP/COEP" : ""}${info.fallbackReason ? " · WebGPU: " + info.fallbackReason : ""}`);
            setStatus("ready"); setHint("ยกมือหนึ่งข้างให้อยู่กลางกล้อง");
            const filter = new AslStabilizer(info.health.confidence);
            let lastFrame = 0, lastRequest = -Infinity, inFlight = false, epoch = 0, previous: { x: number; y: number } | null = null, lastVideo = -1;
            const clear = () => { epoch++; filter.reset(); current.current = emptyAslSample(); setSample(emptyAslSample()); };
            resetObservation.current = clear;
            const loop = (now: number) => {
                if (!active()) return;
                if (document.hidden || capture.paused || capture.ended || acquired!.getVideoTracks().some(t => t.muted || t.readyState !== "live")) {
                    clear(); previous = null; raf.current = requestAnimationFrame(loop); return;
                }
                if (current.current.at && now - current.current.at > 1500) clear();
                // Keep checking hand removal while inference runs, but avoid
                // competing with ONNX for CPU every 110 ms on slower devices.
                if (now - lastFrame >= (inFlight ? 250 : 110) && capture.readyState >= 2 && capture.currentTime !== lastVideo) {
                    lastFrame = now; lastVideo = capture.currentTime;
                    try {
                        const handStarted = performance.now();
                        const result = recognizer!.recognizeForVideo(capture, now);
                        const handMs = performance.now() - handStarted;
                        const points = result.landmarks.length === 1 ? result.landmarks[0] : null, box = points ? handBounds(points) : null;
                        if (!points || !box) {
                            clear(); previous = null;
                            setHint(result.landmarks.length > 1 ? "ใช้มือข้างเดียวในการทำอักษร" : "ยังไม่พบมือ ลองยกมือเข้ากล้อง");
                        } else {
                            const center = points[9];
                            if (previous && Math.hypot(center.x - previous.x, center.y - previous.y) > .22) clear();
                            previous = center;
                            if (!inFlight && now - lastRequest >= 200) {
                                inFlight = true; lastRequest = now;
                                const handEpoch = epoch, capturedAt = handStarted;
                                void (async () => {
                                    const frame = await createImageBitmap(capture);
                                    if (!active() || handEpoch !== epoch || document.hidden) { frame.close(); return; }
                                    const prediction = await engine.predict(frame, box);
                                    if (!active() || handEpoch !== epoch || document.hidden) return;
                                    const at = performance.now(), next = filter.observe(prediction.letter, prediction.confidence, capturedAt, at);
                                    current.current = next; setSample(next); setLatency(Math.round(at - capturedAt)); setError("");
                                    setTiming({ handMs: Math.round(handMs), preprocessMs: Math.round(prediction.preprocessMs), inferenceMs: Math.round(prediction.inferenceMs) });
                                    setHint(next.stable ? "อักษรนิ่งแล้ว พร้อมยืนยัน" : next.letter ? "ถือท่าต่ออีกนิด" : "ยังไม่แน่ใจ ลองปรับมุมมือและแสง");
                                })().catch(e => {
                                    if (!active()) return;
                                    clear(); clean(); setStatus("error"); setHealth(null); setError(errorText(e));
                                    setHint("เปิดโมเดลใหม่ หรือลองเลือก WASM ในการตั้งค่า");
                                }).finally(() => { inFlight = false; });
                            }
                        }
                    } catch (e) { clear(); setError(errorText(e)); }
                }
                if (active()) raf.current = requestAnimationFrame(loop);
            };
            raf.current = requestAnimationFrame(loop);
        } catch (e) {
            if (active()) { clean(); setStatus("error"); setHealth(null); setSample(emptyAslSample()); setError(errorText(e)); }
            else { acquired?.getTracks().forEach(track => track.stop()); recognizer?.close(); }
        }
    }, [clean, stop, url, provider]);
    const resetSample = useCallback(() => { resetObservation.current?.(); current.current = emptyAslSample(); setSample(emptyAslSample()); }, []);
    useEffect(() => { const visibility = () => resetSample(); document.addEventListener("visibilitychange", visibility); return () => document.removeEventListener("visibilitychange", visibility); }, [resetSample]);
    const proof = useCallback(() => document.hidden ? null : sampleProof(current.current, performance.now()), []);
    return { url, provider, backend, status, error, health, sample, hint, latency, timing, diagnostic, start, stop, configure, attach, proof, resetSample };
}
export type AslCamera = ReturnType<typeof useAslCamera>;
