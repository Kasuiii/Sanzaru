import { ASL_ALPHABET, isAslLetter } from "./asl-shared";

// Increment when preprocessing, decoding or hand association changes.
export const ASL_BROWSER_ADAPTER = "asl-onnx-detect-v2";
export type OutputFormat = "end2end" | "raw-bcn" | "raw-bnc";
export type AslManifest = {
    schema: 1;
    model: string;
    sha256: string;
    task: "detect";
    inputSize: number;
    inputName: string;
    outputName: string;
    outputFormat: OutputFormat;
    labels: (string | null)[];
    confidence: number;
    iou: number;
    associationOverlap: number;
    inputMode: "full-frame" | "hand-crop";
    mirror: boolean;
};
export type Box = { x1: number; y1: number; x2: number; y2: number };
export type Detection = { box: Box; confidence: number; classId: number };

export function readAslManifest(value: unknown): AslManifest {
    if (!value || typeof value !== "object") throw new Error("ไฟล์กำกับโมเดลต้องเป็น JSON object");
    const d = value as Record<string, unknown>;
    const numberIn = (v: unknown, low: number, high: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= low && v <= high;
    const name = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;
    if (d.schema !== 1 || d.task !== "detect" || !name(d.model) || typeof d.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(d.sha256)
        || !numberIn(d.inputSize, 128, 1280) || d.inputSize % 32 !== 0 || !name(d.inputName) || !name(d.outputName)
        || !["end2end", "raw-bcn", "raw-bnc"].includes(String(d.outputFormat))
        || !Array.isArray(d.labels) || d.labels.length < 5 || d.labels.length > 256 || d.labels.some(l => l !== null && !isAslLetter(l))
        || new Set(d.labels.filter(l => l !== null)).size < 5
        || !numberIn(d.confidence, .5, 1) || !numberIn(d.iou, .01, 1) || !numberIn(d.associationOverlap, .01, 1)
        || d.inputMode !== undefined && !["full-frame", "hand-crop"].includes(String(d.inputMode))
        || d.mirror !== undefined && typeof d.mirror !== "boolean")
        throw new Error("ไฟล์กำกับโมเดลไม่ถูกต้อง ใช้ scripts/export-asl-onnx.py สร้างใหม่ (detect, float32, A–Z อย่างน้อย 5 ตัว)");
    // Explicit order makes fingerprints independent of JSON key order and notes.
    return { schema: 1, model: d.model, sha256: d.sha256, task: "detect", inputSize: d.inputSize,
        inputName: d.inputName, outputName: d.outputName, outputFormat: d.outputFormat as OutputFormat,
        labels: [...d.labels] as (string | null)[], confidence: d.confidence, iou: d.iou, associationOverlap: d.associationOverlap,
        inputMode: d.inputMode === "hand-crop" ? "hand-crop" : "full-frame", mirror: d.mirror === true };
}

/** The padded landmark box gets context around fingers and wrist. Keep native
 * camera pixels until this crop is resized, so a distant hand fills more input. */
export function inferenceRegion(width: number, height: number, hand: Box, crop: boolean, mirror: boolean) {
    if (!(width > 0 && height > 0) || !Object.values(hand).every(Number.isFinite)
        || hand.x1 < 0 || hand.y1 < 0 || hand.x2 > 1 || hand.y2 > 1 || hand.x2 <= hand.x1 || hand.y2 <= hand.y1)
        throw new Error("ตำแหน่งมือไม่ถูกต้อง");
    const side = Math.ceil(Math.max(128, (hand.x2 - hand.x1) * width * 1.6, (hand.y2 - hand.y1) * height * 1.6));
    const w = crop ? Math.min(width, side) : width, h = crop ? Math.min(height, side) : height;
    const x = crop ? Math.max(0, Math.min(width - w, Math.floor((hand.x1 + hand.x2) * width / 2 - w / 2))) : 0;
    const y = crop ? Math.max(0, Math.min(height - h, Math.floor((hand.y1 + hand.y2) * height / 2 - h / 2))) : 0;
    const roi = { x1: (hand.x1 * width - x) / w, x2: (hand.x2 * width - x) / w,
        y1: (hand.y1 * height - y) / h, y2: (hand.y2 * height - y) / h };
    return { x, y, width: w, height: h, hand: mirror ? { ...roi, x1: 1 - roi.x2, x2: 1 - roi.x1 } : roi };
}

export function manifestLetters(m: AslManifest) { return ASL_ALPHABET.filter(l => m.labels.includes(l)); }
export function fingerprintPayload(m: AslManifest, runtimeVersion: string) {
    // The hosting URL and chosen provider do not change the model's identity.
    const { model: _url, ...config } = m;
    return JSON.stringify({ adapter: ASL_BROWSER_ADAPTER, runtimeVersion, ...config });
}

export function letterbox(width: number, height: number, size: number) {
    if (!(width > 0 && height > 0 && size > 0)) throw new Error("ขนาดภาพไม่ถูกต้อง");
    const scale = Math.min(size / width, size / height);
    const resizedWidth = Math.round(width * scale), resizedHeight = Math.round(height * scale);
    return { width, height, size, scale, resizedWidth, resizedHeight,
        left: Math.max(0, Math.round((size - resizedWidth) / 2 - .1)), top: Math.max(0, Math.round((size - resizedHeight) / 2 - .1)) };
}
export type Letterbox = ReturnType<typeof letterbox>;
export function rgbaToNchw(rgba: Uint8ClampedArray, size: number, result: Float32Array = new Float32Array(size * size * 3)) {
    const pixels = size * size;
    if (rgba.length !== pixels * 4 || result.length !== pixels * 3) throw new Error("ขนาดภาพ RGB ไม่ตรงกับโมเดล");
    for (let i = 0; i < pixels; i++) {
        result[i] = rgba[i * 4] / 255;
        result[pixels + i] = rgba[i * 4 + 1] / 255;
        result[2 * pixels + i] = rgba[i * 4 + 2] / 255;
    }
    return result;
}
function area(b: Box) { return Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1); }
function intersection(a: Box, b: Box) { return area({ x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), x2: Math.min(a.x2, b.x2), y2: Math.min(a.y2, b.y2) }); }
export function handOverlap(a: Box, b: Box) { const min = Math.min(area(a), area(b)); return min > 0 ? intersection(a, b) / min : 0; }
function boxIou(a: Box, b: Box) { const intersect = intersection(a, b); return intersect / (area(a) + area(b) - intersect); }
function restoreBox(x1: number, y1: number, x2: number, y2: number, t: Letterbox): Box {
    const clip = (n: number) => Math.max(0, Math.min(1, n));
    return { x1: clip((x1 - t.left) / t.scale / t.width), y1: clip((y1 - t.top) / t.scale / t.height),
        x2: clip((x2 - t.left) / t.scale / t.width), y2: clip((y2 - t.top) / t.scale / t.height) };
}

/** Only decoded YOLO detect tensors: no objectness, logits, masks or guessed layouts. */
export function decodeDetections(data: Float32Array, dims: readonly number[], m: AslManifest, transform: Letterbox): Detection[] {
    const channels = m.labels.length + 4;
    if (dims.length !== 3 || dims[0] !== 1 || dims.some(n => !Number.isInteger(n) || n <= 0) || dims.reduce((a, b) => a * b, 1) !== data.length
        || (m.outputFormat === "end2end" ? dims[2] !== 6 : m.outputFormat === "raw-bcn" ? dims[1] !== channels : dims[2] !== channels))
        throw new Error("Output shape ไม่ตรงกับ manifest: " + dims.join(" × "));
    const count = m.outputFormat === "raw-bcn" ? dims[2] : dims[1];
    if (count > 100000) throw new Error("โมเดลมีจำนวน detection เกินขอบเขตที่รองรับ");
    const read = (i: number, c: number) => m.outputFormat === "raw-bcn" ? data[c * count + i] : data[i * dims[2] + c];
    const detections: Detection[] = [];
    for (let i = 0; i < count; i++) {
        let x1 = read(i, 0), y1 = read(i, 1), x2 = read(i, 2), y2 = read(i, 3), confidence = read(i, 4), classId = read(i, 5);
        if (m.outputFormat !== "end2end") {
            classId = 0;
            for (let c = 1; c < m.labels.length; c++) if (read(i, c + 4) > confidence) { confidence = read(i, c + 4); classId = c; }
            const width = x2, height = y2;
            x1 -= width / 2; y1 -= height / 2; x2 = x1 + width; y2 = y1 + height;
        }
        if (![x1, y1, x2, y2, confidence, classId].every(Number.isFinite) || confidence < m.confidence || confidence > 1
            || !Number.isInteger(classId) || classId < 0 || classId >= m.labels.length || x2 <= x1 || y2 <= y1) continue;
        const box = restoreBox(x1, y1, x2, y2, transform);
        if (area(box) > 0) detections.push({ box, confidence, classId });
    }
    detections.sort((a, b) => b.confidence - a.confidence);
    if (m.outputFormat === "end2end") return detections;
    // Match Ultralytics' default class-aware, single-label NMS. Bound work for malformed models.
    const kept: Detection[] = [];
    for (const d of detections.slice(0, 3000)) {
        if (!kept.some(k => k.classId === d.classId && boxIou(k.box, d.box) > m.iou)) kept.push(d);
        if (kept.length >= 300) break;
    }
    return kept;
}
export function selectAslDetection(detections: Detection[], hand: Box, m: AslManifest) {
    const chosen = detections.filter(d => handOverlap(d.box, hand) >= m.associationOverlap).sort((a, b) => b.confidence - a.confidence)[0];
    const letter = chosen ? m.labels[chosen.classId] : null;
    return { letter: letter || null, confidence: letter && chosen ? chosen.confidence : 0 };
}
