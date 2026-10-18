export type RitualRole = "caster" | "scribe" | "relay";
export const ROLES = [
 {id:"relay" as const,title:"มิซารุ",roman:"MIZARU",kanji:"見猿",vow:"SEE NO EVIL",alias:"ไม่มองความชั่ว · ผู้เชื่อมใจ",color:"#91c9b0",description:"ไม่เห็นอสูรและตำรา รับคำบอกกับแผ่นสัญลักษณ์ แล้วเรียบเรียงให้ทั้งสองฝั่งเข้าใจกัน",reflection:"เมื่อมองไม่เห็นทั้งหมด เราต้องกล้าถามก่อนตัดสิน"},
 {id:"caster" as const,title:"คิคาซารุ",roman:"KIKAZARU",kanji:"聞か猿",vow:"HEAR NO EVIL",alias:"ไม่ฟังความชั่ว · ผู้ลงมือ",color:"#dfbd7d",description:"เห็นตราอสูร แต่ไม่รู้สูตรและฟังเสียงไม่ได้ อ่านคำจากมิซารุ แล้วใช้นิ้ววาดวงจรผนึก",reflection:"ความเงียบเปิดที่ให้เราไตร่ตรอง ก่อนลงมือ"},
 {id:"scribe" as const,title:"อิวาซารุ",roman:"IWAZARU",kanji:"言わ猿",vow:"SPEAK NO EVIL",alias:"ไม่กล่าวความชั่ว · ผู้รักษาตำรา",color:"#b6addc",description:"รู้สูตรแต่ไม่เห็นอสูร พิมพ์และส่งเสียงไม่ได้ เรียงแผ่นจุดกับท่ามือเพื่อบอกมิซารุ",reflection:"ถ้อยคำอาจหายไป แต่ความรับผิดชอบต่อสารยังอยู่"},
];
// A game interpretation of the three vows, not a simulation of disability.
export const CHAPTERS = [
 {title:"ภาพลวง",question:"สิ่งที่เห็น คือทั้งหมดของความจริงหรือ?"},
 {title:"เสียงลือ",question:"เราเชื่อเพราะรู้ หรือเพราะมีคนบอก?"},
 {title:"ถ้อยคำ",question:"คำอธิบายของเราเปลี่ยนความหมายไปหรือไม่?"},
 {title:"ความไว้ใจ",question:"เมื่อรู้อยู่เพียงบางส่วน เรายังไว้ใจใครได้?"},
 {title:"ความรับผิดชอบ",question:"เราเลือกทำอะไร กับความจริงที่ได้รับมา?"},
] as const;
export const SILENT_INTENTS = [
 {id:"ack" as const,symbol:"✓",label:"เข้าใจแล้ว"},
 {id:"repeat" as const,symbol:"↻",label:"ขอคำใบ้อีกครั้ง"},
 {id:"wait" as const,symbol:"…",label:"กำลังค้นตำรา"},
];
export type SilentSignal = {kind:"route";nodes:number[];gesture:string}|{kind:"intent";intent:"ack"|"repeat"|"wait"};
export function canHear(role:RitualRole){return role!=="caster";}
export function canSendVoice(from:RitualRole,to:RitualRole){return from!=="scribe"&&canHear(to)&&(from==="relay"?to==="scribe":from==="caster"&&to==="relay");}
// Return a fresh, allowlisted object; unknown fields never enter room messages.
export function sanitizeSignal(input:unknown):SilentSignal|null{
 if(!input||typeof input!=="object")return null;
 const s=input as Record<string,unknown>;
 if(s.kind==="intent"&&SILENT_INTENTS.some(x=>x.id===s.intent))return{kind:"intent",intent:s.intent as "ack"|"repeat"|"wait"};
 if(s.kind==="route"&&Array.isArray(s.nodes)&&s.nodes.length>=2&&s.nodes.length<=9&&s.nodes.every(n=>Number.isInteger(n)&&n>=1&&n<=9)&&GESTURES.some(g=>g.id===s.gesture))return{kind:"route",nodes:[...s.nodes] as number[],gesture:s.gesture as string};
 return null;
}
export const NODES = [
 {id:1,x:.2,y:.2},{id:2,x:.5,y:.2},{id:3,x:.8,y:.2},
 {id:4,x:.2,y:.5},{id:5,x:.5,y:.5},{id:6,x:.8,y:.5},
 {id:7,x:.2,y:.8},{id:8,x:.5,y:.8},{id:9,x:.8,y:.8},
];
export const GESTURES = [
 {id:"Open_Palm",name:"แบมือ",hint:"กางนิ้วทั้งห้า",symbol:"✋"},
 {id:"Closed_Fist",name:"กำมือ",hint:"เก็บนิ้วเข้าฝ่ามือ",symbol:"✊"},
 {id:"Victory",name:"ชูสองนิ้ว",hint:"นิ้วชี้กับนิ้วกลาง",symbol:"✌️"},
 {id:"Thumb_Up",name:"ยกนิ้วโป้ง",hint:"กำมือแล้วชูนิ้วโป้ง",symbol:"👍"},
];
export const TINTS = [
 {id:"mint",name:"เขียวมิ้นต์",color:"#91e9df"},
 {id:"pink",name:"ชมพู",color:"#ff94d4"},
 {id:"gold",name:"เหลือง",color:"#ffe18b"},
];
export type Rune={symbol:number;tint:number;rings:number};
export type TracePoint={x:number;y:number;t:number};
export function nodeAt(p:{x:number;y:number}){return NODES.find(n=>Math.hypot(p.x-n.x,p.y-n.y)<.09)?.id??null;}
export function traceNodes(path:TracePoint[]){const nodes:number[]=[];for(const p of path){const id=nodeAt(p);if(id&&nodes.at(-1)!==id)nodes.push(id);}return nodes;}
export function trimTrace(path:TracePoint[]){let last=path.length-1;while(last>0&&!nodeAt(path[last]))last--;return path.slice(0,last+1);}
