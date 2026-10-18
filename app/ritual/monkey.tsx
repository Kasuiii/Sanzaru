import {ROLES,type RitualRole} from "@/lib/ritual-shared";

/** Original vector character art. Role IDs stay stable for saved rooms. */
export function MonkeyArt({role,className=""}:{role:RitualRole;className?:string}){
 const info=ROLES.find(r=>r.id===role)!;
 return <img className={"monkey-art "+className} src={"/assets/sanzaru/"+role+".svg"} alt={info.title+" · "+info.vow} width={360} height={400} draggable={false}/>;
}

export function SanzaruLore(){
 return <div className="sanzaru-lore">
  <p className="lore-context">เรื่องเล่าต่อไปนี้เป็นโลกสมมติของเกม อ่านประวัติจากแหล่งอ้างอิงและคำถามชวนคิดได้ใน <a href="/chronicle" target="_blank" rel="noreferrer" style={{textDecoration:"underline"}}>บันทึกสามวานร ↗</a></p>
  <p className="lore-opening">ถ้าไม่มีใครเห็นความจริงทั้งหมด<br/><strong>เราจะรับผิดชอบต่อมันร่วมกันได้อย่างไร?</strong></p>
  <p>ณ ศาลระหว่างความจริงกับภาพลวง เงาอคติเติบโตจากสิ่งที่เราด่วนเชื่อ วานรสามตนจึงแบ่งหน้าที่กัน: หนึ่งตนลงมือ หนึ่งตนรักษาความรู้ และอีกตนเชื่อมความเข้าใจ ไม่มีตนใดผ่านพิธีได้ลำพัง</p>
  <div className="lore-vows">{ROLES.map(role=><article key={role.id} style={{"--role-color":role.color} as React.CSSProperties}><MonkeyArt role={role.id}/><div><small>{role.kanji} · {role.roman}</small><h3>{role.title}</h3><p>{role.reflection}</p></div></article>)}</div>
  <blockquote>การปิดรับความชั่ว ไม่ได้ปลดเราออกจากความรับผิดชอบต่อผู้อื่น</blockquote>
  <p>ในเกม มิซารุไม่มองอสูรโดยตรง แต่ยังอ่านสารจากเพื่อนได้ คิคาซารุไม่รับเสียง แต่ยังสื่อสารด้วยตัวอักษร ส่วนอิวาซารุไม่ส่งถ้อยคำ แต่ยังส่งสัญลักษณ์ได้ ข้อจำกัดเหล่านี้เป็นพันธสัญญาเชิงสัญลักษณ์</p>
  <small className="lore-context">นี่คือการตีความเพื่อเกมที่ได้รับแรงบันดาลใจจาก Three Wise Monkeys ไม่ใช่คำอธิบายความเชื่อดั้งเดิมทั้งหมดหรือการจำลองความพิการ</small>
 </div>;
}
