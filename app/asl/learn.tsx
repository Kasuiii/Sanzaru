"use client";
import { useState } from "react";
import { ArrowUpRight, BookOpen, CheckCircle2, Download, RotateCw, Volume2 } from "lucide-react";
import { ASL_ALPHABET, ASL_SOURCES } from "@/lib/asl-shared";
import { AslShell, Kicker, speakAloud } from "./shell";
import { useAslCamera } from "./use-asl-camera";
import { CameraPanel } from "./camera-panel";
const hints: Record<string, string> = { A: "กำมือ โดยให้นิ้วโป้งอยู่ด้านข้างกำปั้น", B: "เหยียดนิ้วทั้งสี่ชิดกัน และพับนิ้วโป้งเข้าฝ่ามือ", C: "โค้งนิ้วและนิ้วโป้งให้เกิดช่องว่างคล้ายตัว C", L: "เหยียดนิ้วชี้และนิ้วโป้งให้เป็นมุมคล้ายตัว L พับนิ้วที่เหลือ", Y: "เหยียดนิ้วโป้งและนิ้วก้อย พับนิ้วชี้ กลาง และนาง" };
type Trial = {
    expected: string;
    detected: string;
    confidence: number;
    correct: boolean;
};
export default function AslLearn() { return <AslShell active="/lab"><Practice /></AslShell>; }
function Practice() {
    const camera = useAslCamera(), [target, setTarget] = useState("A"), [trials, setTrials] = useState<Trial[]>([]), [message, setMessage] = useState("");
    const correct = trials.filter(t => t.correct).length;
    function record() { const proof = camera.proof(); if (!proof) {
        setMessage("รอผลอักษรที่นิ่งก่อนบันทึก");
        return;
    } if (trials.length >= 10)
        return; camera.resetSample(); setTrials(v => [...v, { expected: target, detected: proof.letter, confidence: proof.confidence, correct: target === proof.letter }]); setMessage(proof.letter === target ? "อักษรตรงกับที่ตั้งใจ" : "โมเดลอ่านต่างจากที่ตั้งใจ ลองดูแสง มุมมือ และข้อมูลฝึก"); }
    function download() { const text = "trial,expected,detected,confidence,correct\n" + trials.map((t, i) => [i + 1, t.expected, t.detected, t.confidence.toFixed(4), t.correct].join(",")).join("\n"), url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "sanzaru-asl-trials.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return <><section className="asl-container asl-page-intro"><Kicker>THE ALPHABET STUDIO</Kicker><h1>เริ่มจากอักษรหนึ่งตัว<br /><em>ในจังหวะของคุณ.</em></h1><p>เรียนรู้จากแหล่งสอน ASL แล้วทดลองกับโมเดลของทีมได้ที่นี่<br />ยังไม่ต้องเข้าห้อง ไม่จับเวลา และภาพไม่ได้ถูกส่งให้ผู้เล่นคนอื่น</p></section>
    <section className="asl-container asl-studio-grid"><div className="asl-panel asl-learning-card"><div className="asl-panel-heading"><span><BookOpen size={18}/>อักษรที่อยากฝึก</span><span className="asl-badge">A–Z MODEL CLASSES</span></div><div className="asl-letter-picker" role="group" aria-label="เลือกอักษรเป้าหมาย">{ASL_ALPHABET.map(l => <button key={l} aria-pressed={target === l} onClick={() => { setTarget(l); setMessage(""); camera.resetSample(); }}>{l}</button>)}</div><div className="asl-study-letter">{target}</div><button className="asl-text-link" onClick={() => speakAloud("Letter " + target, "en-US")}><Volume2 size={17}/>ฟังชื่ออักษร</button><p>{hints[target] || "ดูรูปแบบมือ ตำแหน่ง และทิศทางฝ่ามือจากแหล่งสอน ASL ก่อนทดลอง"}</p><a className="asl-button secondary" href={ASL_SOURCES[1].url} target="_blank" rel="noreferrer">ดูตัวอย่างจาก ASL University <ArrowUpRight size={17}/></a><small>คำบอกลักษณะมือเป็นตัวช่วยทบทวน ควรเรียนจากตัวอย่างที่ถูกต้องและผู้สอน ASL โดยเฉพาะอักษรที่รูปมือคล้ายกัน</small></div><CameraPanel camera={camera}/></section>
    <section className="asl-container asl-trial-section"><div><Kicker>OBSERVE / RECORD / IMPROVE</Kicker><h2>ลองตรวจ 10 ครั้ง<br /><em>เก็บสิ่งที่เกิดขึ้นจริง.</em></h2><p>เลือกอักษร ทำท่ามือ แล้วกดบันทึกผลครั้งละหนึ่งตัว<br />เลือกหลายอักษร และเอามือลงระหว่างครั้งเพื่อทดลองใหม่</p><p className="asl-note">J และ Z ใน ASL ใช้การเคลื่อนไหว ผลจากโมเดลภาพนิ่งนี้ตรวจเพียง class ตามชุดฝึก ไม่ยืนยันการเคลื่อนไหว และ ASL ไม่ใช่ภาษามือไทยหรือภาษามือสากล</p></div><div className="asl-panel"><div className="asl-panel-heading"><span>การทดลองของฉัน</span><b>{trials.length}/10 ครั้ง</b></div><div className="asl-trial-dots" aria-label="ผลการทดลอง">{Array.from({ length: 10 }, (_, i) => <span key={i} className={trials[i] ? (trials[i].correct ? "correct" : "incorrect") : ""} title={trials[i] ? "ตั้งใจ " + trials[i].expected + " โมเดลอ่าน " + trials[i].detected : "ยังไม่ได้ทดลอง"}>{trials[i] ? (trials[i].correct ? "✓" : "×") : i + 1}</span>)}</div><p>ตรงกับอักษรที่ตั้งใจ <strong>{correct}/{trials.length}</strong> ครั้ง</p><div className="asl-actions"><button className="asl-button" onClick={record} disabled={!camera.sample.stable || trials.length >= 10}><CheckCircle2 size={17}/>บันทึกผลครั้งนี้</button><button className="asl-icon-button" onClick={() => { setTrials([]); setMessage(""); camera.resetSample(); }} aria-label="เริ่มการทดลองใหม่"><RotateCw size={17}/></button></div>{message && <p role="status" className="asl-notice">{message}</p>}{trials.length > 0 && <><div className="asl-table-scroll"><table><caption>ผลการตรวจจากโมเดล ASL ของคุณ</caption><thead><tr><th>ครั้ง</th><th>ตั้งใจ</th><th>ตรวจได้</th><th>ผล</th></tr></thead><tbody>{trials.map((t, i) => <tr key={i}><td>{i + 1}</td><td>{t.expected}</td><td>{t.detected}</td><td>{t.correct ? "ตรง" : "ต่าง"}</td></tr>)}</tbody></table></div><button className="asl-button secondary" onClick={download}><Download size={16}/>ดาวน์โหลดผล CSV</button></>}<small>เป็นผลของชุดทดลองนี้เท่านั้น ไม่ใช่ความแม่นยำของโมเดลกับทุกคน ข้อมูลการทดลองอยู่ในหน้านี้จนกว่าจะโหลดใหม่</small></div></section>
    <section className="asl-container asl-bottom-note"><p>โมเดลอ่านพลาดได้ ความผิดพลาดไม่ได้แปลว่าผู้ใช้ทำไม่ได้ ควรตรวจทั้งตัวอย่างภาษามือ แสง มุมกล้อง และความหลากหลายของข้อมูลฝึก</p><a className="asl-button" href="/play">พร้อมแล้ว ไปเล่นกับเพื่อน <ArrowUpRight size={17}/></a></section>
  </>;
}
