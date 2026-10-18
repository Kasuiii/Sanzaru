"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Accessibility, ArrowUpRight, Menu, X, Volume2, HeartHandshake } from "lucide-react";
import { ASL_ROLES, type AslRole } from "@/lib/asl-shared";
type Preferences = {
    large: boolean;
    contrast: boolean;
    motion: boolean;
    captions: boolean;
    speech: boolean;
};
const defaults: Preferences = { large: false, contrast: false, motion: false, captions: false, speech: false };
const Context = createContext({ preferences: defaults, setPreference: (_key: keyof Preferences, _value: boolean) => { } });
export const useAslAccess = () => useContext(Context);
export function speakAloud(text: string, lang = "th-TH") {
    if (typeof window === "undefined" || !("speechSynthesis" in window))
        return false;
    window.speechSynthesis.cancel();
    const line = new SpeechSynthesisUtterance(text);
    line.lang = lang;
    line.rate = .85;
    window.speechSynthesis.speak(line);
    return true;
}
export function Monkey({ role, className = "" }: {
    role: AslRole;
    className?: string;
}) { const r = ASL_ROLES.find(x => x.id === role)!; return <img src={"/assets/sanzaru/" + r.art + ".svg"} alt={r.name + " — " + r.title} className={"asl-monkey " + className} width="360" height="400" draggable={false}/>; }
export function Seal({ stage = 0, complete = false }: {
    stage?: number;
    complete?: boolean;
}) { return <div className={"asl-seal " + (complete ? "is-complete" : "")} aria-hidden="true"><svg viewBox="0 0 300 300" fill="none"><circle cx="150" cy="150" r="138"/><circle cx="150" cy="150" r="121"/><circle cx="150" cy="150" r="99"/><path d="M150 34 260 113 218 243 82 243 40 113Z"/><path d="M150 60 236 123 203 224 97 224 64 123Z"/>{[0, 1, 2, 3, 4].map(i => <circle key={i} cx={150 + Math.sin(i * Math.PI * .4) * 121} cy={150 - Math.cos(i * Math.PI * .4) * 121} r="7" className={i < stage || complete ? "lit" : ""}/>)}</svg><span>{complete ? "✺" : ["◈", "≋", "✧", "◇", "✺"][Math.min(stage, 4)]}</span></div>; }
const navigation = [{ href: "/", label: "หน้าหลัก" }, { href: "/play", label: "ห้องเล่น" }, { href: "/lab", label: "ฝึก ASL" }, { href: "/chronicle", label: "แนวคิด" }, { href: "/workshop", label: "สำหรับผู้จัด" }];
export function AslShell({ active, children, game = false }: {
    active: string;
    children: ReactNode;
    game?: boolean;
}) {
    const [menu, setMenu] = useState(false), [access, setAccess] = useState(false), [preferences, setPreferences] = useState(defaults);
    useEffect(() => { try {
        const p = JSON.parse(localStorage.getItem("sanzaru-access-v3") || "null");
        if (p)
            setPreferences(Object.fromEntries(Object.keys(defaults).map(k => [k, p[k] === true])) as Preferences);
    }
    catch { } }, []);
    const setPreference = (key: keyof Preferences, value: boolean) => setPreferences(p => { const next = { ...p, [key]: value }; try {
        localStorage.setItem("sanzaru-access-v3", JSON.stringify(next));
    }
    catch { } return next; });
    return <Context.Provider value={{ preferences, setPreference }}><div className={"asl-site " + (game ? "asl-game-site " : "") + (preferences.large ? "asl-large " : "") + (preferences.contrast ? "asl-contrast " : "") + (preferences.motion ? "asl-still" : "")}>
    <a className="asl-skip" href="#asl-main">ข้ามไปเนื้อหาหลัก</a>
    <header className="asl-nav"><a className="asl-brand" href="/" aria-label="SANZARU หน้าหลัก"><span className="asl-brand-mark" aria-hidden="true">三猿</span><span>SANZARU<small>HAND TO HEART</small></span></a>
      <button className="asl-icon-button asl-mobile-menu" onClick={() => setMenu(!menu)} aria-label={menu ? "ปิดเมนู" : "เปิดเมนู"} aria-expanded={menu} aria-controls="asl-navigation">{menu ? <X /> : <Menu />}</button>
      <nav id="asl-navigation" className={menu ? "open" : ""} aria-label="เมนูหลัก">{navigation.map(n => <a key={n.href} href={n.href} aria-current={active === n.href ? "page" : undefined} onClick={() => setMenu(false)}>{n.label}</a>)}</nav>
      <button className="asl-access-toggle" onClick={() => setAccess(!access)} aria-expanded={access} aria-controls="asl-access"><Accessibility size={18}/><span>การเข้าถึง</span></button>
    </header>
    {access && <section id="asl-access" className="asl-access-panel" aria-label="ปรับการเข้าถึง"><div><strong>เลือกวิธีที่สบายสำหรับคุณ</strong><p>ตัวช่วยไม่ลดคะแนน ทุกคนมีสิทธิ์เลือกช่องทางการสื่อสาร</p></div><div className="asl-access-options">{([
                ["large", "ตัวอักษรใหญ่"], ["contrast", "ความต่างสีสูง"], ["motion", "ลดการเคลื่อนไหว"], ["captions", "แสดงอักษรประกอบเสียงให้ Mizaru"], ["speech", "อ่านสถานะเกมอัตโนมัติ"],
            ] as [
                keyof Preferences,
                string
            ][]).map(([k, label]) => <label key={k}><input type="checkbox" checked={preferences[k]} onChange={e => setPreference(k, e.target.checked)}/>{label}</label>)}</div><button className="asl-button secondary small" onClick={() => speakAloud("ยินดีต้อนรับสู่ ซันซารุ เกมส่งต่อความหมายด้วยมือและหัวใจ")}><Volume2 size={16}/>ลองเสียงอ่าน</button></section>}
    <main id="asl-main">{children}</main>
    {!game && <footer className="asl-footer"><div className="asl-container asl-footer-top"><div><a className="asl-brand" href="/"><span className="asl-brand-mark" aria-hidden="true">三猿</span><span>SANZARU<small>HAND TO HEART</small></span></a><p>ความหมายเดินทางได้หลายทาง<br />และทุกคนควรมีที่อยู่ในบทสนทนา</p></div><div><a href="/lab">เริ่มฝึกอักษร <ArrowUpRight size={15}/></a><a href="/chronicle#sources">ที่มาและแหล่งเรียนรู้ <ArrowUpRight size={15}/></a><a href="/workshop">ร่วมออกแบบการเรียนรู้ <ArrowUpRight size={15}/></a></div><span className="asl-footer-motto"><HeartHandshake size={32}/>Different ways.<br /><em>Shared meaning.</em></span></div><div className="asl-container asl-footer-bottom"><span>ต้นแบบเกมเพื่อการเรียนรู้อักษร ASL · รุ่น 3.0</span><span>ออกแบบเพื่อพัฒนาร่วมกับผู้ใช้ที่มีความต้องการหลากหลาย</span></div></footer>}
  </div></Context.Provider>;
}
export function Kicker({ children }: {
    children: ReactNode;
}) { return <p className="asl-kicker"><span aria-hidden="true"/> {children}</p>; }
