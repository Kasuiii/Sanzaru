import type * as Ort from "onnxruntime-web/webgpu";
import { decodeDetections, fingerprintPayload, inferenceRegion, letterbox, manifestLetters, readAslManifest, rgbaToNchw, selectAslDetection, type AslManifest, type Box } from "./asl-onnx";

let ort: typeof Ort, session: Ort.InferenceSession, manifest: AslManifest;
let canvas: OffscreenCanvas, context: OffscreenCanvasRenderingContext2D;
let inputBuffer: Float32Array;
let loading = false, running = false;
const progress = (message: string) => self.postMessage({ progress: message });
const sha256 = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
function assetUrl(value: string, base: string) {
    const url = new URL(value, base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (self.location.protocol === "https:" && url.protocol !== "https:"))
        throw new Error("ใช้ URL โมเดลแบบ HTTPS หรือ localhost โดยไม่มีรหัสผ่านใน URL");
    return url.href;
}
async function fetchAsset(url: string, cache: RequestCache = "default") {
    const response = await fetch(url, { credentials: "omit", cache, signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`โหลด ${new URL(url).pathname} ไม่สำเร็จ (HTTP ${response.status}) ตรวจไฟล์โมเดลและรัน pnpm prepare:onnx`);
    return response;
}
async function run(input: Float32Array, hand: Box, width: number, height: number) {
    const tensor = new ort.Tensor("float32", input, [1, 3, manifest.inputSize, manifest.inputSize]);
    let outputs: Ort.InferenceSession.ReturnType | undefined;
    try {
        const started = performance.now();
        outputs = await session.run({ [manifest.inputName]: tensor });
        const inferenceMs = performance.now() - started;
        const output = outputs[manifest.outputName];
        if (!output || output.type !== "float32" || !(output.data instanceof Float32Array)) throw new Error("รองรับ output float32 สำหรับ YOLO detect เท่านั้น");
        return { ...selectAslDetection(decodeDetections(output.data, output.dims, manifest, letterbox(width, height, manifest.inputSize)), hand, manifest), inferenceMs };
    } finally {
        tensor.dispose();
        if (outputs) for (const output of Object.values(outputs)) output.dispose();
    }
}
async function load(url: string, requested: "auto" | "wasm") {
    progress("กำลังอ่านข้อมูลโมเดล");
    const manifestUrl = assetUrl(url, self.location.origin);
    manifest = readAslManifest(await (await fetchAsset(manifestUrl, "no-cache")).json());
    progress("กำลังดาวน์โหลดโมเดล ASL");
    const modelBytes = await (await fetchAsset(assetUrl(manifest.model, manifestUrl), "no-cache")).arrayBuffer();
    if (await sha256(modelBytes) !== manifest.sha256) throw new Error("SHA-256 ของโมเดลไม่ตรงกับ manifest ให้อัปโหลดไฟล์คู่เดียวกันแล้วเปิดใหม่");
    progress("กำลังโหลด ONNX Runtime");
    const runtime = await (await fetchAsset(self.location.origin + "/onnx/runtime.json", "no-cache")).json() as {
        version: string; base: string; entry: string; module: string; parts: string[]; sha256: string;
    };
    // Runtime code always comes from this site, never from the model manifest.
    if (!/^\d+\.\d+\.\d+$/.test(runtime.version) || runtime.base !== `/onnx/${runtime.version}/`
        || runtime.entry !== "ort.webgpu.bundle.min.mjs" || runtime.module !== "ort-wasm-simd-threaded.jsep.mjs"
        || !Array.isArray(runtime.parts) || runtime.parts.length < 1 || runtime.parts.length > 10 || runtime.parts.some(p => !/^runtime-\d+\.bin$/.test(p)))
        throw new Error("ข้อมูล runtime ไม่ถูกต้อง รัน pnpm prepare:onnx ใหม่");
    const base = self.location.origin + runtime.base, entry = base + runtime.entry;
    ort = await import(/* @vite-ignore */ entry) as typeof Ort;
    if (ort.env.versions.web !== runtime.version) throw new Error("เวอร์ชัน JavaScript และ WASM ไม่ตรงกัน");
    const parts = await Promise.all(runtime.parts.map(async part => new Uint8Array(await (await fetchAsset(base + part)).arrayBuffer())));
    const binary = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let offset = 0;
    for (const part of parts) { binary.set(part, offset); offset += part.length; }
    if (await sha256(binary.buffer) !== runtime.sha256) throw new Error("ไฟล์ WASM ไม่ครบหรือแคชคนละรุ่น รัน pnpm prepare:onnx แล้ว deploy ใหม่");
    // Shared memory requires COOP/COEP on the document AND worker response.
    const threads = self.crossOriginIsolated ? Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2))) : 1;
    ort.env.wasm.numThreads = threads;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = { mjs: base + runtime.module };
    ort.env.wasm.wasmBinary = binary;
    const create = async (provider: "webgpu" | "wasm") => {
        progress(provider === "webgpu" ? "กำลังเตรียมโมเดลด้วย WebGPU" : "กำลังเตรียมโมเดลด้วย WASM");
        session = await ort.InferenceSession.create(modelBytes, { executionProviders: [provider], graphOptimizationLevel: "all" });
        const input = session.inputMetadata[0];
        if (session.inputNames.length !== 1 || session.inputNames[0] !== manifest.inputName || session.outputNames.length !== 1 || session.outputNames[0] !== manifest.outputName
            || !input.isTensor || input.type !== "float32" || JSON.stringify(input.shape) !== JSON.stringify([1, 3, manifest.inputSize, manifest.inputSize]))
            throw new Error("Input/output ของ ONNX ไม่ตรงกับ manifest ต้องเป็น detect แบบ fixed float32 NCHW");
        // Execute once to catch unsupported operators and validate the real output before enabling readiness.
        await run(new Float32Array(3 * manifest.inputSize ** 2).fill(114 / 255), { x1: 0, y1: 0, x2: 1, y2: 1 }, manifest.inputSize, manifest.inputSize);
    };
    let provider: "webgpu" | "wasm" = requested === "auto" && "gpu" in navigator ? "webgpu" : "wasm", fallback = false;
    let fallbackReason = requested === "auto" && !("gpu" in navigator) ? "เบราว์เซอร์ไม่เปิด WebGPU" : "";
    try { await create(provider); }
    catch (error) {
        if (provider !== "webgpu") throw error;
        fallbackReason = String(error instanceof Error ? error.message : error).slice(0, 400);
        await session?.release().catch(() => {});
        provider = "wasm"; fallback = true;
        await create(provider);
    }
    canvas = new OffscreenCanvas(manifest.inputSize, manifest.inputSize);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("เบราว์เซอร์ไม่รองรับการเตรียมภาพใน Worker");
    context = ctx;
    inputBuffer = new Float32Array(3 * manifest.inputSize ** 2);
    const modelId = await sha256(new TextEncoder().encode(fingerprintPayload(manifest, runtime.version)).buffer);
    return { health: { modelId, letters: manifestLetters(manifest), confidence: manifest.confidence, inputMode: manifest.inputMode, task: "detect" }, provider, fallback,
        fallbackReason, threads, isolated: self.crossOriginIsolated, mirror: manifest.mirror, inputSize: manifest.inputSize };
}
self.onmessage = async ({ data }) => {
    try {
        let result;
        if (data.type === "load") {
            if (loading || session) throw new Error("โมเดลกำลังโหลดหรือเปิดอยู่แล้ว");
            loading = true;
            try { result = await load(data.url, data.provider); } finally { loading = false; }
        } else if (data.type === "predict") {
            const frame = data.frame as ImageBitmap;
            try {
                if (!session || running || loading) throw new Error("โมเดลยังไม่พร้อมรับภาพใหม่");
                running = true;
                const started = performance.now();
                const region = inferenceRegion(frame.width, frame.height, data.hand, manifest.inputMode === "hand-crop", manifest.mirror);
                const t = letterbox(region.width, region.height, manifest.inputSize);
                context.fillStyle = "rgb(114,114,114)";
                context.fillRect(0, 0, manifest.inputSize, manifest.inputSize);
                context.save();
                if (manifest.mirror) { context.translate(t.left * 2 + t.resizedWidth, 0); context.scale(-1, 1); }
                context.drawImage(frame, region.x, region.y, region.width, region.height, t.left, t.top, t.resizedWidth, t.resizedHeight);
                context.restore();
                const pixels = context.getImageData(0, 0, manifest.inputSize, manifest.inputSize);
                const input = rgbaToNchw(pixels.data, manifest.inputSize, inputBuffer);
                const preprocessMs = performance.now() - started;
                result = { ...await run(input, region.hand, region.width, region.height), preprocessMs };
            } finally { frame.close(); running = false; }
        } else throw new Error("ไม่รู้จักคำสั่งโมเดล");
        self.postMessage({ id: data.id, result });
    } catch (error) { self.postMessage({ id: data.id, error: error instanceof Error ? error.message : String(error) }); }
};
