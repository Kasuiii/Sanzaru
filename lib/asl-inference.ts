import { isAslLetter } from "./asl-shared";
export const ASL_PROTOCOL = "asl-alphabet-v1";
export type AslHealth = {
    letters: string[];
    modelId: string;
    confidence: number;
    inputMode: "full-frame" | "hand-crop";
    task: string;
};
export type AslSample = {
    letter: string | null;
    confidence: number;
    heldMs: number;
    at: number;
    stable: boolean;
};
export const emptyAslSample = (): AslSample => ({ letter: null, confidence: 0, heldMs: 0, at: 0, stable: false });
export function readAslHealth(v: unknown): AslHealth {
    if (!v || typeof v !== "object")
        throw new Error("คำตอบจาก ASL API ไม่ถูกต้อง");
    const d = v as Record<string, unknown>;
    if (d.protocol !== ASL_PROTOCOL)
        throw new Error("API นี้ไม่ใช่ ASL API กรุณาเปิด asl_app:app");
    if (d.ready !== true)
        throw new Error(typeof d.error === "string" ? d.error : "โมเดลยังไม่พร้อม");
    if (!Array.isArray(d.letters) || d.letters.length < 5 || d.letters.some(x => !isAslLetter(x)) || typeof d.model_id !== "string" || !/^[a-f0-9]{64}$/.test(d.model_id) || typeof d.confidence !== "number" || !Number.isFinite(d.confidence) || d.confidence < .5 || d.confidence > 1 || !["detect", "classify"].includes(String(d.task)) || !["full-frame", "hand-crop"].includes(String(d.input_mode)))
        throw new Error("ข้อมูลความสามารถของ ASL API ไม่สมบูรณ์");
    return { letters: d.letters as string[], modelId: d.model_id, confidence: d.confidence, inputMode: d.input_mode as AslHealth["inputMode"], task: String(d.task) };
}
export function readAslPrediction(v: unknown, modelId: string) {
    if (!v || typeof v !== "object")
        throw new Error("คำตอบโมเดลไม่ถูกต้อง");
    const d = v as Record<string, unknown>;
    if (d.protocol !== ASL_PROTOCOL || d.model_id !== modelId)
        throw new Error("โมเดลเปลี่ยนระหว่างเล่น กรุณาเชื่อมต่อใหม่");
    if (d.letter !== "None" && !isAslLetter(d.letter) || typeof d.confidence !== "number" || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1)
        throw new Error("ผลอ่านอักษรไม่ถูกต้อง");
    return { letter: d.letter === "None" ? null : d.letter as string, confidence: d.confidence };
}
/** Stability uses capture times, not arrival times. Unknown/late/low-confidence
 * observations reset the streak. Never synthesize ASL from MediaPipe labels. */
export class AslStabilizer {
    private letter: string | null = null;
    private started = 0;
    private previous = 0;
    private count = 0;
    constructor(private threshold = .75) { }
    reset() { this.letter = null; this.started = 0; this.previous = 0; this.count = 0; }
    observe(letter: string | null, confidence: number, capturedAt: number, now: number): AslSample {
        if (!isAslLetter(letter) || !Number.isFinite(confidence) || confidence < this.threshold || confidence > 1 || now < capturedAt || now - capturedAt > 1500) {
            this.reset();
            return emptyAslSample();
        }
        if (letter !== this.letter || capturedAt <= this.previous || capturedAt - this.previous > 1500) {
            this.letter = letter;
            this.started = capturedAt;
            this.count = 0;
        }
        this.count++;
        this.previous = capturedAt;
        const heldMs = Math.min(30000, Math.max(0, capturedAt - this.started));
        return { letter, confidence, heldMs, at: capturedAt, stable: this.count >= 3 && heldMs >= 900 };
    }
}
export function sampleProof(s: AslSample, now: number) { if (!s.stable || !s.letter || now - s.at < 0 || now - s.at > 1500)
    return null; return { letter: s.letter, confidence: s.confidence, heldMs: s.heldMs, sampleAgeMs: now - s.at, source: "ai" as const }; }
