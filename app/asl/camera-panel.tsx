"use client";
/* eslint-disable react-hooks/refs -- camera.attach is a callback ref, not a RefObject; the remaining camera fields are React state. */
import { useEffect, useId, useState } from "react";
import { Camera, CameraOff, ChevronDown, Settings2, ShieldCheck, Volume2 } from "lucide-react";
import type { AslCamera } from "./use-asl-camera";
import type { BrowserProvider } from "@/lib/asl-browser-model";
import { speakAloud } from "./shell";
export function CameraPanel({ camera, required = [], compact = false }: {
    camera: AslCamera;
    required?: string[];
    compact?: boolean;
}) {
    const id = useId(), [url, setUrl] = useState(camera.url), [provider, setProvider] = useState<BrowserProvider>(camera.provider), [preview, setPreview] = useState(true);
    // Synchronize editable fields when browser storage is hydrated after SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => setUrl(camera.url), [camera.url]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => setProvider(camera.provider), [camera.provider]);
    const missing = required.filter(l => !camera.health?.letters.includes(l));
    return <section className={"asl-camera-panel " + (compact ? "compact" : "")} aria-label="กล้องตรวจอักษร ASL"><div className="asl-panel-heading"><span><Camera size={18}/> กล้องอักษร ASL</span><span className={"asl-badge " + (camera.status === "ready" ? "success" : "")}>{camera.status === "ready" ? "เชื่อมแล้ว" : camera.status === "loading" ? "กำลังเชื่อม" : "ยังไม่เชื่อม"}</span></div>
    <div className={"asl-camera-view " + (!preview ? "preview-hidden" : "")}><video ref={camera.attach} autoPlay muted playsInline aria-label="ภาพกล้องของคุณ"/><div className="asl-camera-frame" aria-hidden="true"/>{camera.status !== "ready" && <div className="asl-camera-placeholder"><HandPlaceholder /><p>{camera.status === "loading" ? "กำลังเตรียมกล้องและโมเดล" : "วางมือหนึ่งข้างไว้กลางกล้อง"}</p></div>}{!preview && camera.status === "ready" && <div className="asl-camera-placeholder"><Camera size={28}/><p>ซ่อนภาพตัวอย่าง · กล้องยังตรวจมืออยู่</p></div>}<span className="asl-camera-tag">{camera.status === "ready" ? "CAMERA ON" : "CAMERA OFF"}</span></div>
    <div className="asl-detection"><div><small>โมเดลอ่านได้</small><strong>{camera.sample.letter || "—"}</strong></div><div><b>{camera.sample.stable ? "พร้อมยืนยัน" : camera.hint}</b><p>{camera.sample.letter ? "ความมั่นใจ " + Math.round(camera.sample.confidence * 100) + "%" : "รอผลจากโมเดลของคุณ"}</p><div className="asl-hold-meter" role="progressbar" aria-label="ความนิ่งของอักษร" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, camera.sample.heldMs / 900) * 100)}><span style={{ width: Math.min(1, camera.sample.heldMs / 900) * 100 + "%" }}/></div></div></div>
    <div className="asl-camera-actions">{camera.status === "ready" ? <button className="asl-button secondary small" onClick={camera.stop}><CameraOff size={16}/>ปิดกล้อง</button> : <button className="asl-button small" onClick={() => void camera.start()} disabled={camera.status === "loading"}><Camera size={16}/>{camera.status === "loading" ? "กำลังเปิด…" : "เชื่อมโมเดลและเปิดกล้อง"}</button>}<button className="asl-icon-button" aria-label="อ่านสถานะกล้อง" onClick={() => speakAloud(camera.sample.letter ? "Letter " + camera.sample.letter : camera.hint, camera.sample.letter ? "en-US" : "th-TH")}><Volume2 size={18}/></button></div>
    {camera.error && <p className="asl-error" role="alert">{camera.error}</p>}
    {camera.health && <p className={missing.length ? "asl-error" : "asl-camera-meta"}>{missing.length ? "โมเดลยังไม่รองรับอักษรของห้อง: " + missing.join(", ") : "รองรับ " + camera.health.letters.length + " อักษร · " + (camera.latency ? camera.latency + " ms" : "พร้อมใช้งาน")}</p>}
    <label className="asl-checkbox"><input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)}/>แสดงภาพกล้องของฉัน</label>
    {camera.status === "loading" && <p className="asl-camera-meta" role="status">{camera.hint} <button className="asl-text-link" onClick={camera.stop}>ยกเลิก</button></p>}
    {camera.backend && <p className="asl-camera-meta">ประมวลผลบนเครื่องนี้ · {camera.backend}</p>}
    {camera.latency > 0 && <p className="asl-camera-meta">หามือ {camera.timing.handMs} ms · เตรียมภาพ {camera.timing.preprocessMs} ms · ONNX {camera.timing.inferenceMs} ms · รวม {camera.latency} ms</p>}
    {camera.diagnostic && <details className="asl-camera-meta"><summary>รายละเอียดการประมวลผล</summary><p>{camera.diagnostic}</p></details>}
    <details className="asl-model-settings" open={camera.status === "error" ? true : undefined}><summary><Settings2 size={16}/>ตั้งค่าโมเดลของทีม<ChevronDown size={16}/></summary><div><label htmlFor={id + "profile"}>ขนาดโมเดล</label><select id={id + "profile"} value={url === "/models/asl/manifest.json" || url === "/models/asl/manifest-640.json" ? url : "custom"} onChange={e => setUrl(e.target.value === "custom" ? "" : e.target.value)}><option value="/models/asl/manifest.json">384 · เร็ว (แนะนำสำหรับ WASM)</option><option value="/models/asl/manifest-640.json">640 · รายละเอียดสูง</option><option value="custom">กำหนด URL เอง</option></select><label htmlFor={id + "url"}>ไฟล์กำกับโมเดล (manifest.json)</label><input id={id + "url"} type="text" value={url} onChange={e => setUrl(e.target.value)} autoComplete="off" spellCheck={false} placeholder="/models/asl/manifest.json"/><label htmlFor={id + "provider"}>การประมวลผล</label><select id={id + "provider"} value={provider} onChange={e => setProvider(e.target.value as BrowserProvider)}><option value="auto">อัตโนมัติ · WebGPU / WASM</option><option value="wasm">WASM · ใช้ CPU</option></select><button className="asl-button secondary small" onClick={() => camera.configure(url.trim() || "/models/asl/manifest.json", provider)}>ใช้การตั้งค่านี้</button><p><ShieldCheck size={14}/>ภาพกล้องประมวลผลในเบราว์เซอร์ของคุณ ส่งเฉพาะอักษรและผลตรวจเข้าห้องเกม</p><p>Iwazaru และ Mizaru ต้องใช้โมเดลและค่าตั้งชุดเดียวกัน ครั้งแรกอาจใช้เวลาดาวน์โหลด อ่านวิธีเตรียมโมเดลใน ASL-SETUP-TH.md</p></div></details>
  </section>;
}
function HandPlaceholder() { return <svg width="54" height="62" viewBox="0 0 54 62" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M17 35V14a4 4 0 0 1 8 0v19M25 31V8a4 4 0 0 1 8 0v25M33 31V13a4 4 0 0 1 8 0v22M41 32V22a4 4 0 0 1 8 0v20c0 12-6 17-17 17-9 0-12-4-17-11L5 34a4 4 0 0 1 6-5l6 6"/></svg>; }
