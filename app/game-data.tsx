import { Flame, Snowflake, Shield, FlaskConical } from "lucide-react";

export const heroes = [
  {name:"EMBER",thai:"เอ็มเบอร์",role:"ตัวตึงสายไฟ",badge:"หัวร้อนง่าย",motto:"ใจเย็นไม่เป็น เน้นยิงแรง",color:"#ffad7d",icon:Flame,description:"ยิงแรงขึ้น 20% · หัวร้อนได้ แต่เล็งก่อน",stat:"โจมตี +20%"},
  {name:"LUMI",thai:"ลูมิ",role:"สายซัพใจเย็น",badge:"คนคุมสติ",motto:"เพื่อนร้อนได้ เดี๋ยวเราเย็นเอง",color:"#91e9df",icon:Snowflake,description:"โล่นานขึ้น 1 วินาที · ใจเย็นจนบอสเกรงใจ",stat:"โล่ +1 วินาที"},
  {name:"NOX",thai:"น็อกซ์",role:"แทงก์ผู้รับจบ",badge:"รับจบอีกละ",motto:"โดนแทนได้ แต่อย่าเทกัน",color:"#c5adff",icon:Shield,description:"พลังชีวิตเพิ่ม 25% · คนแบกมีอยู่จริง",stat:"พลังชีวิต +25%"},
  {name:"PIP",thai:"พิพ",role:"นักปรุงสายชง",badge:"ตัวเปิดเรื่อง",motto:"ชงพลังเก่ง ชงเรื่องก็เก่ง",color:"#ffe18b",icon:FlaskConical,description:"ส่งพลังไวขึ้น 25% · ส่งงานช้า ส่งเวทไว",stat:"ส่งต่อเร็วขึ้น 25%"},
];
export const missions = [
  {name:"ป่ามูนวูด",english:"THE MOONWOOD RIFT",tagline:"บอสเพิ่งตื่น อย่าเพิ่งให้พี่เขาได้กินกาแฟ",description:"รับพลัง ส่งต่อให้คู่หู และปิดรอยแยกก่อนผู้พิทักษ์หินจะตื่นเต็มที่",label:"เริ่มต้น",duration:120,hp:600,damage:13,interval:6.8,className:"moonwood",rule:"โล่สะท้อนพลัง",ruleDescription:"ยกโล่ให้ตรงจังหวะเพื่อสะท้อนการโจมตีกลับไปหาบอส"},
  {name:"หอคอยปริซึม",english:"THE PRISM TOWER",tagline:"งานกลุ่มของจริง รอบนี้ห้ามเพื่อนแบกคนเดียว",description:"บอสแข็งแกร่งขึ้น แต่การส่งต่อเพิ่มพลังคอมโบของคุณ",label:"ท้าทาย",duration:120,hp:860,damage:16,interval:5.8,className:"prism",rule:"คอมโบคู่หู ×1.5",ruleDescription:"พลังที่ผ่านเพื่อนร่วมทีมทำความเสียหายมากขึ้น 50%"},
  {name:"ประตูเพลิง",english:"THE EMBER GATE",tagline:"แอร์ก็เอาไม่อยู่ ถ้าใจยังสู้ก็เข้ามา",description:"บอสโจมตีถี่และแรงขึ้น วางจังหวะโล่กับการส่งพลังให้ดี",label:"เชี่ยวชาญ",duration:90,hp:900,damage:20,interval:4.9,className:"ember-gate",rule:"พลังชาร์จ ×1.3",ruleDescription:"เวทที่ชาร์จเต็มจะรุนแรงขึ้น 30% ใช้เวลาระหว่างการโจมตีให้คุ้ม"},
];
export function CharacterArt({index,className=""}:{index:number;className?:string}) {
  return <div className={"character-art "+className} role="img" aria-label={heroes[index].thai} style={{backgroundPosition:(index*100/3)+"% center"}}/>;
}
