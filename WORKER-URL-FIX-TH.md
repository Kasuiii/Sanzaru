# แก้ Worker URL เป็น file:/// หลัง deploy

ข้อผิดพลาดที่พบ: `Failed to construct 'Worker': Script at 'file:///_next/static/asl-onnx.worker-....js' cannot be accessed from origin 'https://...'`

## สาเหตุและสิ่งที่แก้

Vinext 1.0.0-beta.5 แทน `import.meta.url` ใน client bundle ด้วย `file:///ROOT/lib/asl-browser-model.ts` เมื่อโค้ดสร้าง `new URL(workerPath, import.meta.url)` จึงได้ file URL แม้ตัว Worker จะถูกอัปโหลดอยู่บนเว็บแล้ว

แก้ `lib/asl-browser-model.ts` ให้ import URL ผ่าน Vite โดยตรง:

```ts
import workerUrl from "./asl-onnx.worker.ts?worker&url";
this.worker = new Worker(workerUrl, { type: "module" });
```

Client bundle ใหม่อ้าง `/_next/static/asl-onnx.worker-mTn4FPVH.js` ซึ่ง browser โหลดจาก origin ของเว็บปัจจุบัน ชื่อไฟล์ Worker อาจยังเหมือนเดิมเพราะเนื้อหาฝั่ง inference ไม่เปลี่ยน แต่ client chunk ที่สร้าง Worker เปลี่ยนเป็น `camera-panel-Czr2O7IK.js` ต้อง deploy เว็บทั้งชุด

ไม่ได้เปลี่ยน weights, manifest, thresholds หรือ database schema จึงใช้ D1/R2 และโมเดลเดิมได้

## อัปเดตเว็บที่ deploy อยู่แล้ว

1. แตก ZIP **sanzaru-onnx-worker-fix.zip** ลงโฟลเดอร์ใหม่
2. นำ `wrangler.production.jsonc` ที่ใช้ deploy สำเร็จครั้งก่อนมาไว้ข้าง `dist/` ในโฟลเดอร์ใหม่นี้ เพื่อใช้ชื่อ Worker, D1 ID และ R2 bucket เดิม
3. เปิด PowerShell ในโฟลเดอร์ใหม่นั้น แล้วรัน:

```powershell
npx wrangler@4.92.0 deploy --dry-run --config wrangler.production.jsonc
npx wrangler@4.92.0 deploy --config wrangler.production.jsonc
```

หลัง deploy ให้ผู้เล่นทุกคนโหลดหน้าใหม่ด้วย Ctrl+Shift+R แล้วลองเชื่อมโมเดลใน `/lab` หรือ `/play` อีกครั้ง การแก้นี้ไม่ต้อง train/export โมเดลใหม่หรือ apply migration เพิ่ม

ถ้า deploy จาก source folder ที่แก้แล้ว ใช้:

```powershell
pnpm build
pnpm check:deploy --config wrangler.production.jsonc
pnpm exec wrangler deploy --config wrangler.production.jsonc
```

## ตรวจป้องกันปัญหาซ้ำ

- เพิ่ม regression test ที่ปฏิเสธ constructor แบบ `file:///ROOT/...` ซึ่งล้มเหลวกับ bundle เก่าที่มีปัญหาจริง
- `pnpm check:deploy` อ่าน constructor จาก client bundle ที่ build แล้ว ตรวจ URL ทั้ง HTTPS/localhost และตรวจว่ามี Worker asset จริง
- ทดสอบคลิกปุ่มบน `/lab` และในห้อง Iwazaru ของ `/play` โดยใช้ HTML/client JavaScript จาก production build จริง โหลดโมเดลและ warm-up สำเร็จก่อนเรียกกล้อง
- ชุดทดสอบหน้าเว็บจำลองการปฏิเสธกล้องหลังโมเดลพร้อม เพื่อไม่เปิดอุปกรณ์จริง ข้อความ “ยังไม่ได้อนุญาตกล้อง” ในภาพทดสอบเป็นผลที่ตั้งใจไว้ ไม่ใช่ error เดิม
- Packaging ตรวจผลทดสอบหน้าเว็บและ hash ของ client chunk ก่อนสร้าง ZIP

รายงาน: `docs/testing/asl-production-page.json` และ `docs/testing/asl-production-play.png`

ข้อจำกัดของการทดสอบครั้งก่อน: ทดสอบ runtime และ Worker ที่ build แล้วผ่านตัวโหลดทดสอบ แต่ไม่ได้รัน constructor ที่ถูกแปลงอยู่ใน client bundle จึงไม่พบ file URL นี้ การทดสอบเพิ่มรอบนี้ครอบคลุมเส้นทางที่ผู้เล่นกดจริงแล้ว

อ้างอิงรูปแบบ import ที่ใช้: [Vite Web Workers — Query Suffixes](https://vite.dev/guide/features.html#import-with-query-suffixes)
