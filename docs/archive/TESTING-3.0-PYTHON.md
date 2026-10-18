# Verification — SANZARU 3.0 ASL

ตรวจรุ่นส่งมอบ 18 ตุลาคม 2026 ใช้ Node 24 และ Python 3.12 ในสภาพแวดล้อมทดสอบ

## ผ่านแล้ว

| การตรวจ | ผลและขอบเขต |
|---|---|
| TypeScript `tsc --noEmit --incremental false` | ผ่าน ไม่มี type/syntax error |
| `npm test` / `pnpm test` | ผ่านทั้ง 9 test scripts รวม legacy และ ASL |
| `node scripts/run-framework.mjs build` | ผ่าน client, server และ SSR build |
| `node scripts/local-db.mjs` | ผ่าน migration 0000, 0001, 0002 บน D1 local |
| Python unittest | ผ่าน 15 test methods รวม 7 ASL และ 8 adapter/legacy |
| Server render ของหน้าเว็บ | หน้า /, /play, /lab, /chronicle, /workshop render ได้ เมนู ลิงก์ภายใน และไฟล์ภาพอ้างอิงมีอยู่ |
| ZIP integrity | ตรวจ CRC และ SHA-256 ของไฟล์แต่ละรายการตอนจัดชุดส่งมอบ |

ASL test handler ใช้ D1 adapter บน SQLite ในหน่วยความจำและ R2 mock: สาม token แยกกัน, concurrent readiness, สิทธิ์ตามบทบาท, เฉลยไม่อยู่ใน response ของคนกลาง/ผู้รับ, เริ่มได้เมื่อพร้อม, ครบห้าด่าน, ผิดแล้วลองใหม่, replay คำสั่งเดิมไม่ผ่านซ้ำ, challenge เก่าถูกปฏิเสธ, ส่ง/ฟังเสียงเฉพาะผู้มีสิทธิ์, retry เสียง, พัก/ออก/กลับห้อง/หมุนบทบาท, model fingerprint ตรงกัน, แยก AI/practice, ขนาดคำขอ และการหมดอายุ

Inference test ตรวจ protocol, static alphabet, confidence, การเปลี่ยนโมเดล, capture time, stale/duplicate frames, เปลี่ยนอักษรแล้ว reset, ช่องว่างระหว่างเฟรม และการล้างหลักฐานเมื่อยืนยัน/เริ่มใหม่

Python ใช้ **fake predictor**: ตรวจ exact class mapping, ไม่ใช้ J/Z เป็นอักษรภาพนิ่ง, neutral/unknown/low-confidence, กล่อง detection สัมพันธ์กับมือ, fingerprint, CORS/token, request limits, missing model และ busy request ไม่สะสมเฟรม ไม่ได้ทดสอบความแม่นยำของ weights จริง

## ยังไม่ได้ตรวจ

- ไม่มีไฟล์ ASL `.pt` ของคุณ จึงไม่ได้โหลด/benchmark โมเดลจริงหรือรายงาน accuracy
- ไม่ได้ทดสอบ browser interaction, hydration, layout/screenshots, กล้อง/ไมค์จริง หรือ speech synthesis จริง
- ไม่ได้เปิดใช้สามเครื่องผ่านอินเทอร์เน็ตจริงหรือทดสอบ network load
- ไม่ได้ทดสอบกับผู้พิการ ผู้ใช้ ASL หรือ screen reader จริง และไม่ได้ audit WCAG
- ไม่ได้ deploy Cloudflare หรือทดสอบ GPU/Raspberry Pi
- ไม่ได้รัน `test:local` เดิมซึ่งเป็น smoke test ของเกมรุ่น 2.x จึงไม่ใช้ยืนยันกติกา ASL

## วิธีตรวจต่อก่อนนำเสนอ

1. เปิดเว็บตาม README ใช้ 3 โปรไฟล์/เครื่องบนเซิร์ฟเวอร์เดียวกัน
2. ทดลองแป้นพิมพ์ครบ 5 ด่าน รวมผิดหนึ่งครั้ง ขอทวน พัก รีเฟรช และสลับบท
3. ต่อ ASL model จริง ทดสอบ /health และให้สองบทบาทเปิดกล้องพร้อมกัน
4. อัด/ส่ง/เล่นเสียงจริง แล้วลองเสียงช่วยและอักษรประกอบเสียง
5. เก็บผล 10 ครั้งจากโจทย์ที่กำหนดก่อนเริ่ม พร้อม failure ด้วย
6. ให้ผู้เล่นเป้าหมายช่วยประเมินความเข้าใจและการเข้าถึง

สิ่งที่ compiler/API tests ผ่านไม่ได้ยืนยันว่าภาพมือจริงตรวจถูกหรือทุก browser ใช้งานได้ครบ ผลดังกล่าวต้องวัดแยก
