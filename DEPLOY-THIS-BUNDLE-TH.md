# Deploy ชุด build สำเร็จ

**ถ้าอัปเดตเว็บเดิมเพื่อแก้ Worker `file:///` ให้ใช้ [WORKER-URL-FIX-TH.md](WORKER-URL-FIX-TH.md)** โดยนำ config บัญชีเดิมมาใช้และ deploy ชุดใหม่ได้เลย

สำหรับอัปเดตความเร็ว WASM และระยะตรวจมือ อ่าน [PERFORMANCE-ASL-TH.md](PERFORMANCE-ASL-TH.md) ชุดนี้มีรุ่น 384 และ 640 และ headers สำหรับ CPU หลายเธรด

ZIP นี้มีเว็บ/API ที่ build แล้ว โมเดล ASL จริง, ONNX Runtime, MediaPipe และ D1 migrations ไม่ต้อง export โมเดลหรือ build อีก ไม่ต้องติดตั้ง Python สำหรับการ deploy

## 1. แตก ZIP และเตรียมบัญชี

ใช้ Node.js 22.13 ขึ้นไป เปิด PowerShell ในโฟลเดอร์ที่มี `wrangler.production.example.jsonc` และ `dist/`:

```powershell
npx wrangler@4.92.0 login
npx wrangler@4.92.0 whoami
```

ถ้ายังไม่มีทรัพยากรสำหรับเกมนี้ให้สร้าง:

```powershell
npx wrangler@4.92.0 d1 create sanzaru-db
npx wrangler@4.92.0 r2 bucket create sanzaru-voice
```

ถ้ามี D1/R2 เดิมให้ใช้ชื่อและ ID เดิม บัญชีต้องเปิดใช้ R2 ก่อน

## 2. ใส่ค่าจริง

```powershell
Copy-Item wrangler.production.example.jsonc wrangler.production.jsonc
```

เปิด `wrangler.production.jsonc` ใส่ `database_id` จากคำสั่งสร้าง D1, `database_name`, `bucket_name` และชื่อ Worker ที่ต้องการ คงชื่อ binding **DB** และ **BUCKET** ถ้ามีหลายบัญชีให้ใส่ `account_id` ของบัญชีที่เลือกด้วย ห้าม deploy ขณะยังมี `REPLACE_WITH_YOUR_D1_DATABASE_ID`

## 3. สร้างตารางและเผยแพร่

```powershell
npx wrangler@4.92.0 d1 migrations apply DB --remote --config wrangler.production.jsonc
npx wrangler@4.92.0 deploy --dry-run --config wrangler.production.jsonc
npx wrangler@4.92.0 deploy --config wrangler.production.jsonc
```

Migrations เปลี่ยนฐานข้อมูลที่ระบุใน config ให้ตรวจชื่อบัญชีและฐานข้อมูลก่อนยืนยัน เก็บ migrations ทั้ง 0000–0002 ตามลำดับ คำสั่งสุดท้ายเผยแพร่จริงและตอบ URL ของเว็บ

ไม่ต้องนำ best.pt, dataset, Python environment หรือ node_modules ขึ้น Cloudflare เว็บใช้ ONNX จาก dist/client/models/asl และ runtime จาก dist/client/onnx ซึ่งรวมให้แล้ว ห้ามสลับ manifest กับไฟล์โมเดลคนละรุ่น

## 4. ตรวจหลัง deploy

1. เปิด HTTPS URL ที่ Wrangler แสดง เข้า `/lab` แล้วเชื่อมโมเดลและเปิดกล้อง ใช้ค่า manifest เริ่มต้น `/models/asl/manifest.json`
2. เปิด `/play` สามเครื่อง/สามโปรไฟล์ ลองโหมดแป้นพิมพ์และเสียงก่อน แล้วลอง AI โดยให้ Iwazaru/Mizaru ใช้โมเดลเดียวกัน
3. ทดสอบครบ 5 ด่าน ปิด/เปิดกล้อง กลับแท็บ และดู latency โมเดล ค่าที่เกิน 1.5 วินาทีจะไม่เป็นหลักฐานที่เกมรับ
4. ตั้ง R2 lifecycle สำหรับ prefix `asl/` ตามอายุเสียงที่กิจกรรมต้องการ เช่น 1 วัน ไม่ต้องเปิด bucket เสียงเป็น public

ดูผลและขอบเขตการตรวจใน `MODEL-REPORT-TH.md`, `TESTING.md` และ `PACKAGING-REPORT.json` ชุด performance ผ่าน build และตรวจไฟล์ก่อนแพ็ก ใช้ผล browser ของโมเดลชุดเดียวกัน ส่วนการกดหน้าเว็บและ Wrangler dry-run เป็นผลจากรอบก่อนหน้า ยังไม่ได้ตรวจกล้อง/ไมค์จริงหรือเผยแพร่รุ่นนี้เข้าบัญชีของคุณ

ZIP เป็นชุดสำหรับ deploy ไม่ใช่ source สำหรับแก้ไข หากต้องการเปลี่ยนโค้ดให้แก้ใน source folder เดิมแล้ว build และสร้าง ZIP ใหม่ด้วย `python scripts/package-deploy.py` หลังทดสอบผ่าน

ไฟล์ `SHA256SUMS.txt` ภายในระบุ hash ทุกไฟล์ ส่วน `sanzaru-onnx-deploy.zip.sha256` ข้าง ZIP ใช้ตรวจ archive ทั้งชุด
