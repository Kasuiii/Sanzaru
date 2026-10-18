"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, CheckCircle2, Copy, Download, Hand, Headphones, KeyRound, Keyboard, LogOut, Pause, Play, RotateCw, Send, ShieldCheck, Users, Volume2, Wifi, WifiOff } from "lucide-react";
import { ASL_ALPHABET, ASL_ROLES, DEFAULT_LETTERS, SEAL_STORIES, isAslRole, type AslRole, type AslMode } from "@/lib/asl-shared";
import { AslShell, Kicker, Monkey, Seal, speakAloud, useAslAccess } from "./shell";
import { useAslRoom, type AslRoom } from "./use-asl-room";
import { useAslCamera, type AslCamera } from "./use-asl-camera";
import { CameraPanel } from "./camera-panel";
import { VoiceReceiver, VoiceSender } from "./voice";
import type { AslView } from "@/lib/asl-engine";
export default function AslGame() { return <AslShell active="/play" game><Game /></AslShell>; }
function Game() {
    const party = useAslRoom(), camera = useAslCamera(), { preferences } = useAslAccess(), room = party.room;
    const [notice, setNotice] = useState(""), [manual, setManual] = useState(""), lastSpoken = useRef("");
    useEffect(() => { if (!room || room.role === "kikazaru" || room.mode === "practice" || room.phase === "won")
        camera.stop(); }, [room?.role, room?.mode, room?.phase, !!room, camera.stop]);
    useEffect(() => { setManual(""); setNotice(""); camera.resetSample(); }, [room?.challenge, room?.role, camera.resetSample]);
    useEffect(() => { if (room?.phase === "lobby" && room.mode === "ai" && room.role !== "kikazaru" && room.players.find(p => p.id === room.selfId)?.ready && camera.status !== "ready" && !party.busy)
        void party.action("ready", { ready: false }); }, [room, camera.status, party.busy, party.action]);
    const event = room?.events.at(-1);
    useEffect(() => { if (preferences.speech && event && event.id !== lastSpoken.current) {
        lastSpoken.current = event.id;
        speakAloud(event.text);
    } }, [preferences.speech, event]);
    const lastLetter = useRef("");
    useEffect(() => { if (!camera.sample.stable) {
        lastLetter.current = "";
        return;
    } if (preferences.speech && camera.sample.letter && camera.sample.letter !== lastLetter.current) {
        lastLetter.current = camera.sample.letter;
        speakAloud("Detected letter " + camera.sample.letter, "en-US");
    } }, [camera.sample.stable, camera.sample.letter, preferences.speech]);
    async function submit() { if (!room)
        return; const proof = room.mode === "practice" ? (manual ? { letter: manual, source: "practice" } : null) : camera.proof(); if (!proof) {
        setNotice("รอให้อักษรนิ่งก่อน หรือเลือกอักษรในโหมดทดลอง");
        return;
    } setNotice(""); if (await party.action(room.role === "iwazaru" ? "sign" : "answer", { ...proof, modelId: camera.health?.modelId, challenge: room.challenge })) {
        setManual("");
        camera.resetSample();
    } }
    if (!room)
        return <><Entry party={party}/>{party.session && <div className="asl-container asl-restoring" role="status"><Wifi size={18}/>กำลังเชื่อมกลับห้อง {party.session.code}<button className="asl-text-link" onClick={party.forget}>ออกจากเซสชันนี้</button></div>}</>;
    const self = room.players.find(p => p.id === room.selfId)!, role = ASL_ROLES.find(r => r.id === room.role)!, host = room.hostId === room.selfId, playing = room.phase === "playing";
    return <div className="asl-game-container"><div className="asl-room-bar"><a href="/" className="asl-room-brand">HAND TO HEART <span>/ ภารกิจสามวานร</span></a><div className="asl-room-tools"><span className={"asl-connection " + party.connection}>{party.connection === "online" ? <Wifi size={15}/> : <WifiOff size={15}/>} {party.connection === "online" ? "เชื่อมต่อแล้ว" : "กำลังเชื่อมใหม่"}</span><span className="asl-room-code">ห้อง <b>{room.code}</b></span><button className="asl-icon-button" aria-label="คัดลอกลิงก์เชิญเพื่อน" onClick={async () => { try {
        await navigator.clipboard.writeText(location.origin + "/play?room=" + room.code);
        setNotice("คัดลอกลิงก์เชิญแล้ว");
    }
    catch {
        setNotice("ส่งรหัส " + room.code + " ให้เพื่อนเปิดหน้า /play แล้วเข้าห้องได้เลย");
    } }}><Copy size={16}/></button><button className="asl-icon-button" aria-label="ออกจากห้อง" disabled={party.busy} onClick={() => void party.action("leave")}><LogOut size={17}/></button></div></div>
    <div className="asl-game-notices">{party.error && <p className="asl-error" role="alert">{party.error}</p>}{notice && <p className="asl-notice" role="status">{notice}</p>}{room.mode === "practice" && <p className="asl-practice-banner"><Keyboard size={17}/>โหมดทดลองกติกาด้วยแป้นพิมพ์ · ไม่มีการตรวจ AI ในรอบนี้</p>}</div>
    {room.phase === "lobby" ? <Lobby party={party} camera={camera}/> : room.phase === "won" ? <Results party={party}/> : <>
      <div className="asl-stage-heading"><div><Kicker>THE FIVE SEALS / ตราที่ {room.stage + 1}</Kicker><h1>{SEAL_STORIES[room.stage].name}</h1><p>{SEAL_STORIES[room.stage].question}</p></div><div className="asl-stage-progress" aria-label={"เปิดแล้ว " + room.stage + " จาก 5 ตรา"}>{SEAL_STORIES.map((s, i) => <span key={s.name} className={i < room.stage ? "done" : i === room.stage ? "current" : ""} aria-label={s.name + (i < room.stage ? " เปิดแล้ว" : i === room.stage ? " กำลังเล่น" : " ยังไม่ถึง")}>{i < room.stage ? <Check size={17}/> : s.symbol}</span>)}</div></div>
      {room.phase === "paused" && <section className="asl-paused" aria-label="เกมพักอยู่"><Pause size={27}/><div><h2>พักได้ ทีมรอคุณอยู่</h2><p>กล้องยังเปิดอยู่ได้ แต่ไม่รับคำตอบจนกว่าจะเล่นต่อ</p></div><button className="asl-button" disabled={party.busy || room.players.length !== 3} onClick={() => void party.action("resume")}><Play size={17}/>เล่นต่อ</button>{host && <button className="asl-button secondary" disabled={party.busy} onClick={() => void party.action("rematch")}>กลับล็อบบี</button>}</section>}
      <div className="asl-game-layout"><aside className="asl-player-sidebar"><div className="asl-role-mini" style={{ "--role-color": role.color } as React.CSSProperties}><span aria-hidden="true">{role.kanji}</span><Monkey role={room.role}/><small>คุณคือ {self.name}</small><h2>{role.name}</h2><p>{role.title}</p></div><Roster room={room}/><button className="asl-button secondary" onClick={() => speakAloud(role.description)}><Volume2 size={17}/>ฟังหน้าที่ของฉัน</button><button className="asl-button secondary" disabled={!playing || party.busy} onClick={() => void party.action("pause")}><Pause size={17}/>ขอพักทั้งทีม</button></aside>
      <section className="asl-ritual-center"><div className="asl-central-seal"><Seal stage={room.stage}/><span className="asl-seal-caption">SEAL 0{room.stage + 1}<b>{SEAL_STORIES[room.stage].english}</b></span></div><div className="asl-transmission-steps" aria-label="สถานะการส่งต่อ"><span className={room.requested ? "done" : ""}>1 ขออักษร</span><i>→</i><span className={room.hasSignal ? "done" : ""}>2 ส่งด้วยมือ</span><i>→</i><span className={room.hasRelay ? "done" : ""}>3 ส่งเสียง</span><i>→</i><span>4 ทำอักษรตอบ</span></div>
        <div className="asl-role-task">
          {room.role === "iwazaru" ? <><div className="asl-task-label"><KeyRound size={18}/>เฉลยนี้เห็นเฉพาะคุณ</div><div className="asl-secret-letter">{room.target}</div><h2>{room.requested ? "เพื่อนขอคำตอบแล้ว ส่งด้วยมือได้เลย" : "รอ Kikazaru ส่งคำขอ"}</h2><p>ทำอักษรตามเฉลย ดูว่าโมเดลอ่านได้อะไร แล้วกดยืนยันเพื่อส่งอักษรนั้นให้คนกลาง</p>{room.signal && <p className="asl-sent-letter">ส่งล่าสุด: <b>{room.signal.letter}</b> · ส่งใหม่ได้ถ้าโมเดลอ่านคลาดเคลื่อน</p>}</> :
                room.role === "kikazaru" ? <><div className="asl-task-label"><Hand size={18}/>อักษรจากมือของ Iwazaru</div><div className={"asl-secret-letter " + (!room.signal ? "empty" : "")}>{room.signal?.letter || "?"}</div><h2>{room.signal ? "ส่งความหมายนี้ให้ Mizaru" : "เริ่มด้วยการขอคำตอบจากผู้รู้"}</h2><p>{room.signal ? "นี่คืออักษรที่โมเดลอ่านได้ ไม่ใช่เฉลยที่ระบบส่งให้คุณ" : "คุณเห็นสถานะด่าน แต่ยังไม่รู้เฉลย กดขอให้ Iwazaru ทำอักษร"}</p><button className="asl-button secondary" disabled={!playing || party.busy} onClick={() => void party.action("request", { challenge: room.challenge })}><Send size={16}/>{room.requested ? "ขอให้ทำอักษรอีกครั้ง" : "ขออักษรจาก Iwazaru"}</button></> :
                    <><VoiceReceiver party={party}/><button className="asl-text-link" disabled={!playing || party.busy} onClick={() => void party.action("ask", { challenge: room.challenge })}>ส่งสัญญาณขอคำตอบ / ขอทวนอีกครั้ง <ArrowRight size={16}/></button>{room.feedback && !room.feedback.correct && <p className="asl-feedback" role="status">{room.feedback.text}</p>}</>}
        </div>
      </section><aside className="asl-action-sidebar">
        {room.role === "kikazaru" ? <div className="asl-panel"><div className="asl-panel-heading"><span><Volume2 size={18}/>สะพานแห่งเสียง</span></div>{playing ? <VoiceSender party={party}/> : <p>พักการส่งเสียงไว้จนกว่าจะเล่นต่อ</p>}</div> : <>{room.mode === "ai" ? <CameraPanel camera={camera} required={room.letters} compact/> : <PracticeInput selected={manual} setSelected={setManual}/>}
          <button className="asl-button asl-submit" onClick={() => void submit()} disabled={!playing || party.busy || (room.role === "iwazaru" ? !room.requested : !room.hasRelay) || (room.mode === "ai" ? !camera.sample.stable : !manual)}><CheckCircle2 size={19}/>{room.role === "iwazaru" ? "ส่งอักษรให้ Kikazaru" : "ยืนยันอักษรเพื่อปลดผนึก"}</button><p className="asl-submit-note">ยืนยันเมื่อพร้อม ไม่ส่งคำตอบอัตโนมัติ</p></>}
      </aside></div>
      <section className="asl-event-log" aria-label="บันทึกสถานะทีม"><h2>จังหวะของทีม</h2><p role="status" aria-live="polite" aria-atomic="true">{event?.text || "รอการส่งต่อครั้งแรก"}</p><details><summary>ดูเหตุการณ์ก่อนหน้า</summary><ol>{room.events.slice(-8).map(e => <li key={e.id}>{e.text}</li>)}</ol></details></section>
    </>}
  </div>;
}
function Entry({ party }: {
    party: AslRoom;
}) {
    const [tab, setTab] = useState<"create" | "join">("create"), [name, setName] = useState(""), [code, setCode] = useState(""), [role, setRole] = useState<AslRole>("iwazaru"), [mode, setMode] = useState<AslMode>("ai");
    useEffect(() => { const p = new URLSearchParams(location.search), r = p.get("role"), c = p.get("room"); if (isAslRole(r))
        setRole(r); if (c) {
        setCode(c.toUpperCase().slice(0, 6));
        setTab("join");
    } }, []);
    return <section className="asl-entry asl-container"><div className="asl-entry-story"><Kicker>WELCOME TO THE SHRINE</Kicker><h1>สามมือ สามใจ<br /><em>เปิดผนึกไปด้วยกัน.</em></h1><p>ชวนเพื่อนอีกสองคน เลือกบทบาท<br />แล้วให้หนึ่งอักษรเดินทางผ่านพวกคุณ</p><div className="asl-entry-art"><Seal /><Monkey role="kikazaru"/></div><div className="asl-entry-notes"><span><Users size={17}/>ผู้เล่น 3 คน คนละเครื่อง</span><span><ShieldCheck size={17}/>ไม่จับเวลา · พักได้ทุกคน</span></div><a className="asl-text-link" href="/lab">ฝึกอักษรก่อนเข้าห้อง <ArrowUpRight size={16}/></a></div>
    <div className="asl-entry-form"><div className="asl-entry-tabs" role="group" aria-label="สร้างหรือเข้าห้อง"><button aria-pressed={tab === "create"} onClick={() => setTab("create")}>สร้างห้องใหม่</button><button aria-pressed={tab === "join"} onClick={() => setTab("join")}>เข้าห้องเพื่อน</button></div><h2>{tab === "create" ? "เริ่มบทสนทนาใหม่" : "เพื่อนกำลังรอคุณ"}</h2><p>ไม่ต้องสมัครสมาชิก ตั้งชื่อแล้วร่วมทีมได้เลย</p><form onSubmit={e => { e.preventDefault(); void party.enter(tab, name, role, mode, code); }}><label htmlFor="asl-player-name">ชื่อที่ให้เพื่อนเรียก</label><input id="asl-player-name" required value={name} maxLength={24} placeholder="เช่น ไอซ์" onChange={e => setName(e.target.value)} autoComplete="nickname"/>{tab === "join" && <><label htmlFor="asl-join-code">รหัสห้อง 6 ตัว</label><input id="asl-join-code" required value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} minLength={6} maxLength={6} autoComplete="off" placeholder="ABC234" className="asl-code-input"/></>}
      <fieldset><legend>บทบาทที่อยากลอง</legend><div className="asl-entry-roles">{ASL_ROLES.map(r => <label key={r.id} className={role === r.id ? "selected" : ""}><input type="radio" name="entry-role" value={r.id} checked={role === r.id} onChange={() => setRole(r.id)}/><Monkey role={r.id}/><strong>{r.name}</strong><small>{r.verb}</small></label>)}</div></fieldset>
      {tab === "create" && <fieldset><legend>เลือกวิธีเล่น</legend><label className={"asl-mode-choice " + (mode === "ai" ? "selected" : "")}><input type="radio" name="mode" checked={mode === "ai"} onChange={() => setMode("ai")}/><Hand size={19}/><span><strong>เล่นด้วยโมเดล ASL</strong><small>ใช้กล้อง + โมเดลของทีม ประมวลผลในเบราว์เซอร์</small></span></label><label className={"asl-mode-choice " + (mode === "practice" ? "selected" : "")}><input type="radio" name="mode" checked={mode === "practice"} onChange={() => setMode("practice")}/><Keyboard size={19}/><span><strong>ทดลองกติกาด้วยแป้นพิมพ์</strong><small>เล่นครบทุกขั้นได้ทันที โหมดนี้ไม่มีการตรวจ AI</small></span></label></fieldset>}
      {party.error && <p className="asl-error" role="alert">{party.error}</p>}<button className="asl-button asl-full" disabled={party.busy || !!party.session} type="submit">{party.busy ? "กำลังเชื่อมต่อ…" : tab === "create" ? "สร้างห้องและชวนเพื่อน" : "เข้าร่วมทีม"}<ArrowRight size={18}/></button></form><p className="asl-form-footnote">บทบาทเป็นกติกาการแบ่งข้อมูล เลือกตามความถนัดได้ ไม่ได้กำหนดจากความพิการของผู้เล่น</p></div>
  </section>;
}
function Roster({ room }: {
    room: AslView;
}) { return <div className="asl-roster"><h3>ทีมของเรา <span>{room.players.length}/3</span></h3>{ASL_ROLES.map(r => { const p = room.players.find(x => x.role === r.id); return <div key={r.id}><span className={"asl-presence " + (p?.online ? "online" : "")}/><div><b>{p ? p.name : "รอเพื่อน"}{p?.id === room.selfId ? " (คุณ)" : ""}</b><small>{r.name}</small></div><span>{p?.ready ? <Check size={16}/> : p?.id === room.hostId ? "เจ้าของ" : ""}</span></div>; })}</div>; }
function Lobby({ party, camera }: {
    party: AslRoom;
    camera: AslCamera;
}) {
    const room = party.room!, host = room.hostId === room.selfId, self = room.players.find(p => p.id === room.selfId)!, [letters, setLetters] = useState(room.letters), [mode, setMode] = useState(room.mode);
    useEffect(() => { setLetters(room.letters); setMode(room.mode); }, [room.letters.join(""), room.mode]);
    const modelReady = room.mode === "practice" || room.role === "kikazaru" || camera.status === "ready" && !!camera.health && room.letters.every(l => camera.health!.letters.includes(l));
    return <><div className="asl-lobby-heading"><Kicker>GATHER YOUR THREE WISE MONKEYS</Kicker><h1>พร้อมเมื่อทุกคนพร้อม.</h1><p>ส่งรหัส <strong>{room.code}</strong> ให้เพื่อน · เลือกคนละบทบาท · ปรับตัวช่วยที่เมนูการเข้าถึงได้</p></div><div className="asl-lobby-grid"><div className="asl-lobby-main"><div className="asl-lobby-roles">{ASL_ROLES.map(r => { const p = room.players.find(x => x.role === r.id); return <article key={r.id} className={room.role === r.id ? "mine" : ""} style={{ "--role-color": r.color } as React.CSSProperties}><span className="asl-role-kanji" aria-hidden="true">{r.kanji}</span><Monkey role={r.id}/><h2>{r.name}</h2><h3>{r.title}</h3><p>{r.description}</p><div className="asl-seat">{p ? <><span className={"asl-dot " + (!p.online ? "offline" : "")}/>{p.name}{p.ready && <CheckCircle2 size={16}/>}</> : <span>รอเพื่อนมารับบท</span>}</div>{room.role !== r.id && !p && <button className="asl-button secondary small" disabled={party.busy} onClick={() => void party.action("role", { role: r.id })}>เลือกบทนี้</button>}{room.role === r.id && <span className="asl-you-badge">บทบาทของคุณ</span>}</article>; })}</div>
      <div className="asl-panel asl-room-settings"><div className="asl-panel-heading"><span>ชุดอักษรของทีม</span><span className="asl-badge">{room.letters.join(" · ")}</span></div>{host ? <><p>เลือกอย่างน้อย 5 ตัว ระบบจะสุ่ม 5 อักษรไม่ซ้ำเป็นโจทย์ ทั้งสองคนต้องใช้โมเดลที่รองรับชุดนี้</p><div className="asl-letter-picker" role="group" aria-label="เลือกอักษรสำหรับเกม">{ASL_ALPHABET.map(l => <button key={l} aria-pressed={letters.includes(l)} onClick={() => setLetters(v => v.includes(l) ? v.filter(x => x !== l) : [...v, l])}>{l}</button>)}</div><div className="asl-settings-bottom"><label htmlFor="asl-room-mode">วิธีเล่น <select id="asl-room-mode" value={mode} onChange={e => setMode(e.target.value as AslMode)}><option value="ai">โมเดล ASL จริง</option><option value="practice">แป้นพิมพ์ทดลองกติกา</option></select></label><button className="asl-button secondary small" disabled={letters.length < 5 || party.busy} onClick={() => void party.action("settings", { letters, mode })}>บันทึกชุดอักษร</button></div><small>เลือกได้ตามอักษรที่โมเดลรองรับ J/Z ตรวจจากภาพตามชุดฝึก ยังไม่ตรวจการเคลื่อนไหวครบรูปแบบ</small></> : <p>เจ้าของห้องเป็นคนเลือกชุดอักษรและโหมด ทีมสามารถขอปรับให้ตรงกับโมเดลหรือความต้องการของผู้เล่นได้</p>}</div>
    </div><aside className="asl-lobby-aside">{room.mode === "ai" && room.role !== "kikazaru" ? <CameraPanel camera={camera} required={room.letters}/> : <div className="asl-panel asl-ready-note">{room.role === "kikazaru" ? <Headphones size={32}/> : <Keyboard size={32}/>}<h2>{room.role === "kikazaru" ? "เตรียมพร้อมเป็นสะพาน" : "เริ่มจากเรียนรู้กติกา"}</h2><p>{room.role === "kikazaru" ? "คุณไม่ต้องเปิดกล้อง อ่านอักษรจาก Iwazaru แล้วใช้ไมโครโฟนหรือเสียงช่วยส่งต่อให้ Mizaru" : "โหมดนี้ให้เลือกอักษรด้วยแป้นพิมพ์เพื่อทดลองระบบห้องและการส่งต่อ ยังไม่ใช่ผลตรวจจากโมเดล"}</p></div>}
      <button className={"asl-button asl-full " + (self.ready ? "secondary" : "")} disabled={party.busy || !modelReady && !self.ready} onClick={() => void party.action("ready", { ready: !self.ready, capabilities: camera.health?.letters || [], modelId: camera.health?.modelId || "" })}><CheckCircle2 size={18}/>{self.ready ? "พร้อมแล้ว · กดเพื่อยกเลิก" : "ฉันพร้อมแล้ว"}</button>{!modelReady && <p className="asl-submit-note">เชื่อมโมเดลและเปิดกล้องก่อนกดพร้อม</p>}
      {host && <><button className="asl-button asl-full" disabled={party.busy || room.players.length !== 3 || room.players.some(p => !p.ready || !p.online)} onClick={() => void party.action("start")}><Play size={18}/>เริ่มพิธี 5 ตราผนึก</button><button className="asl-text-link" disabled={party.busy || room.players.length !== 3} onClick={() => void party.action("rotate")}><RotateCw size={16}/>สลับบทบาททั้งทีม</button></>}<p className="asl-form-footnote">ภาพกล้องไม่ถูกส่งให้เพื่อน เกมส่งต่อเฉพาะอักษรและข้อความเสียง</p>
    </aside></div></>;
}
function PracticeInput({ selected, setSelected }: {
    selected: string;
    setSelected: (s: string) => void;
}) { return <section className="asl-panel"><div className="asl-panel-heading"><span><Keyboard size={18}/>แป้นพิมพ์ทดลอง</span></div><p>เลือกอักษรเพื่อจำลองการส่งผล ไม่มีการตรวจ AI</p><div className="asl-letter-picker" role="group" aria-label="เลือกอักษรจำลอง">{ASL_ALPHABET.map(l => <button key={l} aria-pressed={selected === l} onClick={() => setSelected(l)}>{l}</button>)}</div><p className="asl-selected-letter">เลือก: <strong>{selected || "—"}</strong></p></section>; }
function Results({ party }: {
    party: AslRoom;
}) {
    const room = party.room!, [reflection, setReflection] = useState(""), minutes = Math.floor(room.elapsedMs / 60000), seconds = Math.floor(room.elapsedMs / 1000) % 60;
    function download() { const rows = (room.results || []).map((r, i) => "| " + (i + 1) + " | " + r.target + " | " + r.sourceLetter + " | " + r.answer + " | " + r.attempts + " |").join("\n"); const text = "# SANZARU · Hand to Heart\n\nโหมด: " + (room.mode === "ai" ? "โมเดล ASL" : "ทดลองด้วยแป้นพิมพ์ — ไม่ใช่ AI") + "\n\nเปิดตรา: 5/5 · ตอบทั้งหมด " + room.totalAttempts + " ครั้ง\n\n| ด่าน | เฉลย | Iwazaru ส่งล่าสุด | Mizaru ตอบสำเร็จ | จำนวนครั้งที่ตอบ |\n|---|---|---|---|---|\n" + rows + "\n\n## สิ่งที่ทีมได้เรียนรู้\n" + reflection + "\n\nข้อมูลนี้เป็นผลการเล่น ไม่ใช่ผลวัดความแม่นยำรวมของโมเดลหรือผลการรักษา\n"; const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" })), a = document.createElement("a"); a.href = url; a.download = "sanzaru-reflection.md"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    return <section className="asl-results"><Kicker>FIVE SEALS. ONE CONNECTION.</Kicker><h1>ความหมายเดินทางมาถึงแล้ว.</h1><p>ทุกมือมีส่วน ทุกเสียงมีความหมาย และความสำเร็จนี้เป็นของทั้งทีม</p><div className="asl-win-art"><Monkey role="iwazaru"/><Seal complete stage={5}/><Monkey role="mizaru"/></div><div className="asl-result-stats"><div><strong>5/5</strong><span>ตราผนึกที่เปิด</span></div><div><strong>{room.totalAttempts}</strong><span>จำนวนครั้งที่ตอบ</span></div><div><strong>{minutes}:{String(seconds).padStart(2, "0")}</strong><span>เวลาที่ใช้ ไม่รวมช่วงพัก</span></div></div><div className="asl-panel"><h2>ย้อนดูอักษรของเรา</h2><div className="asl-table-scroll"><table><caption>ผลการส่งต่อเมื่อผ่านแต่ละตรา</caption><thead><tr><th>ตรา</th><th>เฉลย</th><th>ผู้รู้ส่งล่าสุด</th><th>ผู้รับตอบ</th><th>จำนวนครั้ง</th></tr></thead><tbody>{room.results?.map(r => <tr key={r.stage}><th scope="row">{SEAL_STORIES[r.stage].name}</th><td>{r.target}</td><td>{r.sourceLetter}</td><td>{r.answer}</td><td>{r.attempts}</td></tr>)}</tbody></table></div><p>ผลนี้แสดงการเล่นของทีม ไม่ใช่ความแม่นยำรวมของโมเดล</p><label htmlFor="asl-reflection">ครั้งไหนที่เราต้องทวนกัน? ตัวช่วยใดทำให้ทุกคนมีส่วนร่วม?</label><textarea id="asl-reflection" value={reflection} onChange={e => setReflection(e.target.value)} maxLength={3000} rows={4} placeholder="เขียนสิ่งที่อยากลองให้ดีขึ้นในรอบหน้า…"/><button className="asl-button secondary" onClick={download}><Download size={17}/>ดาวน์โหลดบันทึกของทีม</button></div><div className="asl-actions">{room.hostId === room.selfId ? <button className="asl-button" disabled={party.busy} onClick={() => void party.action("rematch")}><RotateCw size={17}/>กลับล็อบบีเพื่อสลับบทและเล่นอีกครั้ง</button> : <p>ให้เจ้าของห้องกลับล็อบบี แล้วสลับบทบาทเพื่อเรียนรู้อีกมุมมอง</p>}<a className="asl-text-link" href="/chronicle">คุยต่อเรื่องการเข้าถึง <ArrowRight size={17}/></a></div></section>;
}
