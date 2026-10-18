// A–Z are model class labels. J/Z here do not certify motion recognition.
export const ASL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
export const DEFAULT_LETTERS = ["A", "B", "C", "L", "Y"];
export type AslRole = "iwazaru" | "kikazaru" | "mizaru";
export type AslMode = "ai" | "practice";
export const ASL_ROLES = [
    { id: "iwazaru" as const, name: "Iwazaru", thai: "อิวาซารุ", kanji: "言わ猿", art: "scribe", color: "#a78bfa", title: "ผู้รักษาความหมาย", vow: "ไม่พูดสิ่งชั่วร้าย", verb: "ส่งด้วยมือ", description: "เห็นคำตอบ รับคำขอจากคนกลาง แล้วทำอักษร ASL ให้โมเดลอ่าน ส่งต่อเฉพาะอักษรที่ตรวจได้" },
    { id: "kikazaru" as const, name: "Kikazaru", thai: "คิคาซารุ", kanji: "聞か猿", art: "caster", color: "#63cfb0", title: "ผู้เชื่อมความเข้าใจ", vow: "ไม่รับฟังสิ่งชั่วร้าย", verb: "เชื่อมด้วยเสียง", description: "ขอคำตอบจาก Iwazaru อ่านอักษรที่โมเดลตรวจได้ แล้วพูดหรือใช้เสียงช่วยส่งต่อให้ Mizaru" },
    { id: "mizaru" as const, name: "Mizaru", thai: "มิซารุ", kanji: "見猿", art: "relay", color: "#f6c776", title: "ผู้ปลดผนึก", vow: "ไม่เห็นสิ่งชั่วร้าย", verb: "ตอบด้วยมือ", description: "ไม่เห็นเฉลย ฟังสารจาก Kikazaru แล้วทำอักษร ASL ให้โมเดลเดียวกันตรวจ เพื่อเปิดตราผนึก" },
] as const;
export const SEAL_STORIES = [
    { name: "การรับรู้", english: "Awareness", symbol: "◈", color: "#a78bfa", question: "เราอาจรับรู้ต่างกัน แต่เริ่มต้นร่วมกันได้" },
    { name: "การรับฟัง", english: "Listening", symbol: "≋", color: "#63cfb0", question: "การรับฟังคือการใส่ใจ ไม่ได้จำกัดอยู่ที่เสียง" },
    { name: "ความเข้าใจ", english: "Understanding", symbol: "✧", color: "#83b9f6", question: "ถามซ้ำได้ จนกว่าความหมายจะตรงกัน" },
    { name: "ความไว้วางใจ", english: "Trust", symbol: "◇", color: "#f3a5b8", question: "ความผิดพลาดคือสิ่งที่ทีมช่วยกันแก้" },
    { name: "การเชื่อมถึงกัน", english: "Connection", symbol: "✺", color: "#f6c776", question: "ความแตกต่างไม่ใช่กำแพงของความร่วมมือ" },
] as const;
export const isAslRole = (v: unknown): v is AslRole => ASL_ROLES.some(r => r.id === v);
export const isAslLetter = (v: unknown): v is string => typeof v === "string" && ASL_ALPHABET.includes(v);
export function normalizeLetters(value: unknown): string[] {
    if (!Array.isArray(value) || value.length < 5 || value.length > 26 || value.some(v => !isAslLetter(v)) || new Set(value).size !== value.length)
        throw new Error("เลือกอักษร A–Z อย่างน้อย 5 ตัว โดยไม่ซ้ำกัน");
    return [...value];
}
export const ASL_SOURCES = [
    { title: "NIDCD · American Sign Language", url: "https://www.nidcd.nih.gov/health/american-sign-language", detail: "ASL เป็นภาษาที่มีไวยากรณ์ของตัวเอง การสะกดนิ้วมือเป็นเพียงส่วนหนึ่ง และภาษามือไม่ได้เหมือนกันทั่วโลก" },
    { title: "ASL University · Fingerspelling", url: "https://www.lifeprint.com/asl101/pages-layout/fingerspelling.htm", detail: "เรียนรู้อักษรจากแหล่งสอนโดยผู้เชี่ยวชาญ J และ Z ต้องอาศัยการเคลื่อนไหว" },
    { title: "W3C WAI · Timing Adjustable", url: "https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html", detail: "ออกแบบให้ผู้เล่นมีเวลาเพียงพอและควบคุมข้อจำกัดด้านเวลาได้" },
    { title: "JNTO · Nikko Toshogu Shrine", url: "https://www.japan.travel/en/spot/1482/", detail: "ภาพแกะสลักสามวานรที่ศาลเจ้านิกโกโทโชกู เป็นแรงบันดาลใจเชิงสัญลักษณ์ของเกม" },
];
