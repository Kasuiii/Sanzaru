import type { AslHealth } from "./asl-inference";
import type { Box } from "./asl-onnx";
import workerUrl from "./asl-onnx.worker.ts?worker&url";

export type BrowserModelInfo = { health: AslHealth; provider: "webgpu" | "wasm"; fallback: boolean; fallbackReason: string; threads: number; isolated: boolean; mirror: boolean; inputSize: number };
export type BrowserPrediction = { letter: string | null; confidence: number; inferenceMs: number; preprocessMs: number };
export type BrowserProvider = "auto" | "wasm";

/** One dedicated worker per camera. Termination cancels downloads/inference and releases resources. */
export class AslBrowserModel {
    private worker: Worker;
    private nextId = 0;
    private closed = false;
    private pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    constructor(private progress: (message: string) => void) {
        // Vinext rewrites import.meta.url to file:///ROOT/... in client modules.
        // Let Vite emit the worker's public URL without resolving against it.
        this.worker = new Worker(workerUrl, { type: "module" });
        this.worker.onmessage = ({ data }) => {
            if (data.progress) { this.progress(data.progress); return; }
            const request = this.pending.get(data.id);
            if (!request) return;
            clearTimeout(request.timer); this.pending.delete(data.id);
            if (data.error) request.reject(new Error(data.error)); else request.resolve(data.result);
        };
        this.worker.onerror = () => this.close(new Error("เปิดตัวประมวลผล ONNX ไม่สำเร็จ ตรวจไฟล์ /onnx/ และ browser console"));
        this.worker.onmessageerror = () => this.close(new Error("รับผลจากตัวประมวลผล ONNX ไม่สำเร็จ"));
    }
    private request<T>(message: object, transfer: Transferable[] = [], timeout = 15000): Promise<T> {
        if (this.closed) return Promise.reject(new Error("โมเดลปิดแล้ว"));
        return new Promise<T>((resolve, reject) => {
            const id = ++this.nextId;
            const timer = setTimeout(() => this.close(new Error("โมเดลใช้เวลานานเกินไป ลอง WASM หรือโมเดลขนาดเล็กลง")), timeout);
            this.pending.set(id, { resolve: v => resolve(v as T), reject, timer });
            try { this.worker.postMessage({ ...message, id }, transfer); }
            catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
        });
    }
    load(url: string, provider: BrowserProvider) {
        return this.request<BrowserModelInfo>({ type: "load", url, provider }, [], 180000);
    }
    predict(frame: ImageBitmap, hand: Box) { return this.request<BrowserPrediction>({ type: "predict", frame, hand }, [frame]); }
    close(reason = new Error("หยุดการประมวลผลแล้ว")) {
        this.closed = true; this.worker.terminate();
        for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(reason); }
        this.pending.clear();
    }
}
