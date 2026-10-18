"use client";
import {useState,type ReactNode} from "react";
import {ArrowUpRight,Menu,X,ArrowRight} from "lucide-react";
const links=[{href:"/",label:"ประตูศาล"},{href:"/chronicle",label:"เรื่องของสามวานร"},{href:"/lab",label:"ห้องทดลองความคิด"},{href:"/workshop",label:"สำหรับผู้จัดกิจกรรม"}];
export function AcademyShell({active,children}:{active:string;children:ReactNode}){
 const [open,setOpen]=useState(false);
 return <div className="academy"><a className="skip-link" href="#academy-main">ข้ามไปเนื้อหา</a>
  <header className="ac-header"><a className="ac-brand" href="/" aria-label="SANZARU หน้าหลัก"><span className="ac-brand-seal" aria-hidden="true">三猿</span><span>SANZARU<small>THE UNSPOKEN PACT</small></span></a>
   <button className="ac-menu" aria-expanded={open} aria-controls="ac-navigation" onClick={()=>setOpen(!open)} aria-label={open?"ปิดเมนู":"เปิดเมนู"}>{open?<X/>:<Menu/>}</button>
   <nav id="ac-navigation" className={open?"is-open":""} aria-label="เมนูหลัก">{links.map(l=><a key={l.href} href={l.href} aria-current={active===l.href?"page":undefined} onClick={()=>setOpen(false)}>{l.label}</a>)}<a className="ac-button ac-small" href="/play">เข้าร่วมพิธี <ArrowUpRight size={16}/></a></nav>
  </header>
  <main id="academy-main">{children}</main>
  <footer className="ac-footer"><div><a className="ac-brand" href="/"><span className="ac-brand-seal" aria-hidden="true">三猿</span><span>SANZARU<small>ไม่มีใครรู้ทั้งหมด ทุกคนจึงมีความหมาย</small></span></a><p>เกมร่วมมือ 3 คน ที่ชวนกลับมาคิดถึงสิ่งที่เราเห็น ฟัง และส่งต่อ</p></div><div className="ac-footer-links"><a href="/chronicle#sources">ที่มาและการตีความ <ArrowUpRight size={14}/></a><a href="/lab#journal">บันทึกของฉัน <ArrowUpRight size={14}/></a><a href="/classic">โหมดเกมเดิม <ArrowUpRight size={14}/></a></div><div className="ac-footer-bottom"><span>THREE PERSPECTIVES. ONE SHARED UNDERSTANDING.</span><span>โปรเจกต์เพื่อการเรียนรู้ · Learning edition 2.2</span></div></footer>
 </div>;
}
export function Eyebrow({children}:{children:ReactNode}){return <p className="ac-eyebrow"><span aria-hidden="true"/>{children}</p>;}
export function PageIntro({number,kicker,title,em,description}:{number:string;kicker:string;title:string;em:string;description:string}){return <section className="ac-page-intro ac-container"><div><Eyebrow>{kicker}</Eyebrow><h1>{title}<br/><em>{em}</em></h1><p className="ac-lead">{description}</p></div><span className="ac-page-number" aria-hidden="true">{number}</span></section>;}
export function NextStep({label,title,description,href,button}:{label:string;title:string;description:string;href:string;button:string}){return <section className="ac-next ac-container"><div><Eyebrow>{label}</Eyebrow><h2>{title}</h2><p>{description}</p></div><a className="ac-button" href={href}>{button}<ArrowRight size={18}/></a></section>;}
