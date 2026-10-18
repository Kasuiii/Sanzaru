import {MessageCircle, Sparkles} from "lucide-react";

// Flavor follows game state; it never changes damage, timing, or room state.
export function BossBanter({time,health,playerHealth,combo=false,warning=false}:{time:number;health:number;playerHealth:number;combo?:boolean;warning?:boolean}){
 const idle=["พี่เป็นบอส ไม่ใช่กระสอบนะ", "งานกลุ่มนี้ ใครเป็นคนแบก?", "ตีเบา ๆ พรุ่งนี้พี่มีงาน", "ชาร์จเวท หรือชาร์จแบตอยู่?"];
 const text=warning?"คุยพอแล้วนะ ยกโล่สิ!":combo?"ส่งกันเก่งขนาดนี้ ส่งพี่กลับบ้านด้วย":health<.34?"เดี๋ยว ๆ พี่ยังไม่ได้วอร์ม":playerHealth<.3?"ใจเย็น พี่ก็ทำตามหน้าที่":time<6?"มากี่คนก็ไหว… หมายถึงพี่นะ":health<.67?"ตกลงมาปิดประตู หรือปิดงานพี่?":idle[Math.floor(time/9)%idle.length];
 return <div className={"boss-banter "+(warning?"boss-banter-warning":"")}><span><MessageCircle size={13}/>พี่ก้อนมีเรื่องจะบอก</span><p key={text}>“{text}”</p></div>;
}

export function RoundVerdict({won,hits,passes,blocks}:{won:boolean;hits:number;passes:number;blocks:number}){
 const award=blocks>=3?{title:"สายเด้งกลับ",line:"บอสส่งมา เราส่งคืน ไม่รับฝาก"}:passes>=3?{title:"เพื่อนดีเด่น",line:"ส่งพลังให้เพื่อนบ่อย งานกลุ่มต้องมีคนนี้"}:hits>=8?{title:"ตัวตึงเข้ากะ",line:"ยิงโดนรัว ๆ บอสขอลาป่วยแล้ว"}:won?{title:"ตึงแบบงง ๆ",line:"แผนไม่มี แต่ชัยชนะมีนะ"}:{title:"แพ้เป็นคอนเทนต์",line:"เกมนี้ซ้อม เกมหน้าก็… ลองอีกที"};
 return <div className="round-verdict"><Sparkles size={21}/><div><span>ฉายารอบนี้</span><strong>{award.title}</strong><p>{award.line}</p></div></div>;
}

export function flavorNotice(text:string){
 const copy:Record<string,string>={"ส่งพลังให้คู่หู!":"เพื่อน! รับงานต่อ!", "โล่พร้อมรับพลัง":"ไม่รับดาเมจค่ะ", "สะท้อนสำเร็จ!":"ตีกลับจ้า!", "FROSTFIRE COMBO":"คอมโบเพื่อนรัก!", "เล็งไปที่ตัวบอส":"บอสอยู่ทางนู้น!"};
 return copy[text]||({"รับพลังแล้ว! ยิงคอมโบ":"รับงานแล้ว! ยิงคอมโบ", "เวทพลาดเป้า":"บอสอยู่ทางนู้น!", "โล่พร้อม":"ไม่รับดาเมจค่ะ"} as Record<string,string>)[text]||text;
}
