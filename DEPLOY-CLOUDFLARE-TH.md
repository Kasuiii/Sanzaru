# เปิดให้เพื่อนเล่นผ่าน Cloudflare — ASL 3.0

เอกสารนี้เป็นขั้นตอนให้คุณนำไปทำเอง ยังไม่ได้สร้างหรือ deploy ทรัพยากรในบัญชีของคุณ

**ชุดปัจจุบันมีโมเดล ONNX จริงแล้ว** และผ่าน build, browser inference และ Wrangler dry-run อ่าน [MODEL-REPORT-TH.md](MODEL-REPORT-TH.md) สำหรับผลตรวจ หากใช้ ZIP `release/sanzaru-onnx-deploy.zip` ให้อ่าน `DEPLOY-THIS-BUNDLE-TH.md` ใน ZIP ซึ่งใช้ไฟล์ build สำเร็จโดยไม่ต้อง build ใหม่ ขั้นตอนด้านล่างสำหรับ source folder ปัจจุบัน

ชื่อบริการคือ **Workers, D1 และ R2**: Worker รันเว็บ/API เกม, D1 เก็บห้อง, R2 เก็บคลิปเสียง และ browser ของผู้เล่นรันโมเดล ONNX

## 1. ตรวจในเครื่องก่อน

แตก ZIP เปิด terminal ที่ root ของโปรเจกต์ จากนั้น:

```sh
pnpm install --frozen-lockfile
pnpm setup:local
pnpm start
```

ลองโหมดแป้นพิมพ์ให้ครบสามบทบาทก่อน ถ้าในเครื่องใช้ได้ หยุดด้วย Ctrl+C แล้วทำขั้นถัดไป

## 2. เตรียมบัญชีและทรัพยากร

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler d1 create sanzaru-db
pnpm exec wrangler r2 bucket create sanzaru-voice
```

จด `database_id` ที่ D1 ตอบ ถ้ามีฐานข้อมูล/ถังเสียงเดิมอยู่แล้วให้ใช้ค่าของทรัพยากรนั้น ไม่จำเป็นต้องสร้างซ้ำ การเปิดใช้ R2 อาจมีขั้นตอนบัญชี/การเรียกเก็บเงินของ Cloudflare; ตรวจหน้าบัญชีก่อนทำ ไม่ถือว่าทุกปริมาณการใช้งานฟรี

## 3. ตั้ง config สำหรับ production

คัดลอก `wrangler.production.example.jsonc` เป็น `wrangler.production.jsonc` ที่ root แล้วแก้:

- `name`: ชื่อ Worker ที่คุณเลือก เช่น `sanzaru-hand-to-heart`
- `database_id`: UUID จริงที่ได้ ไม่ใช่ placeholder
- `database_name`: ชื่อ D1 จริง
- `bucket_name`: ชื่อ R2 จริง

คงชื่อ binding **DB** และ **BUCKET** เพราะโค้ดใช้สองชื่อนี้ หากบัญชีมีหลาย account ให้เลือกบัญชีเดียวกันตอนสร้างและ deploy หรือใส่ `account_id` ของคุณใน config

อย่าใช้ `site-creator-d1`, `site-creator-r2` และ UUID ศูนย์จาก `dist/server/wrangler.json` ไป deploy โดยไม่แก้ ค่าชุดนั้นใช้สำหรับการ build/local ของโปรเจกต์

## 4. สร้างตารางบน D1 ออนไลน์

```sh
pnpm exec wrangler d1 migrations apply DB --remote --config wrangler.production.jsonc
```

คำสั่งนี้เปลี่ยนฐานข้อมูลออนไลน์ที่ config ชี้ ให้ตรวจชื่อบัญชี/ฐานข้อมูลก่อนยืนยัน ใช้ migration ทั้งชุดใน `drizzle/` ตามลำดับ และต้องมี `0002_asl_hand_to_heart.sql` สำหรับตาราง `asl_rooms`

`pnpm db:local` สร้างตารางเฉพาะในเครื่อง ไม่ได้ทำ migration ออนไลน์ให้ และข้อมูลห้องเดิมในเครื่องไม่ได้ถูกคัดลอกขึ้นออนไลน์

## 5. Build และ deploy

```sh
pnpm build
pnpm check:deploy --config wrangler.production.jsonc
pnpm exec wrangler deploy --dry-run --config wrangler.production.jsonc
pnpm exec wrangler deploy --config wrangler.production.jsonc
```

Build ที่ให้เป็น Vinext/Vite สร้าง `dist/server/index.js` และ `dist/client` จึงใช้ config ของ build นี้ ไม่ต้องเพิ่มคำสั่ง `next export` หรืออัปโหลดเฉพาะ `public/`

Wrangler จะแสดง URL จริง เช่น `https://ชื่อ-worker.ชื่อบัญชี.workers.dev` ส่ง **URL ที่คำสั่งตอบจริง** ให้เพื่อน เว็บต้องใช้ HTTPS เพื่อเปิดกล้องและไมค์

ทุกครั้งที่แก้ TS/TSX/CSS ให้ `pnpm build` ก่อน deploy ถ้าเพิ่ม schema ให้ apply migration ที่จำเป็นด้วย

## 6. เตรียมโมเดลและ runtime ให้ครบ

โปรเจกต์นี้มี ONNX ขนาด 9.39 MiB และ manifest ใน `public/models/asl/` แล้ว ทำตาม `ASL-SETUP-TH.md` เฉพาะเมื่อเปลี่ยนโมเดล ไม่ต้องเปิด Python API หรือกำหนด ALLOWED_ORIGINS ของ Python

`pnpm build` เตรียม runtime จาก dependency รุ่นเดียวกันลง `public/onnx/` แล้วคัดลอก assets ไป `dist/client` รวม WASM ที่แบ่งเป็นไฟล์ละไม่เกิน 20 MiB หาก build บน CI ต้องนำไฟล์ ONNX/manifest เข้ามาก่อนเพราะถูก ignore ใน Git

หากไฟล์ ONNX เกิน 25 MiB ให้เก็บบน R2/CDN สำหรับโมเดลที่เปิด CORS และใส่ HTTPS URL ใน manifest.model จากนั้นนำไฟล์ขนาดใหญ่ออกจาก public ก่อน build อย่าเปิด bucket คลิปเสียงเป็น public

หลัง deploy ให้เปิด /lab ตรวจว่าโหลดโมเดลและ runtime ได้ครบ ตรวจ WebGPU/WASM และ latency ถ้าผลเกิน 1.5 วินาที ระบบไม่รับเป็นหลักฐาน ต้องปรับขนาดโมเดลหรือ input ตามผลทดสอบจริง

## 7. ตั้งอายุเสียงใน R2

คลิปเสียงใหม่ใช้ prefix `asl/` และอ่านผ่าน Worker ที่ตรวจสิทธิ์ ไม่ต้องเปิด public access หรือ r2.dev ของ bucket

ใน R2 bucket ตั้ง lifecycle rule สำหรับ prefix `asl/` เช่นให้หมดอายุหลัง 1 วัน หากตรงกับนโยบายกิจกรรมของคุณ การลบของ R2 เป็นกระบวนการตาม lifecycle ไม่ใช่ทันทีตรงวินาที และควรทบทวนผลกับกิจกรรมที่เล่นนานกว่าอายุที่ตั้ง

โค้ดห้องมี idle expiry 2 ชั่วโมงและกวาดห้องเก่าเมื่อสร้างห้องใหม่ แต่ไม่ได้มี background job ที่รับรองการลบทันทีเมื่อครบสองชั่วโมง ดูรายละเอียด retention ใน `ACCESSIBILITY.md`

## 8. ตรวจจากสามเครื่อง

1. ทั้งสามเข้า HTTPS URL เดียวกัน ทดสอบสร้าง/เข้าห้องโหมดแป้นพิมพ์
2. ลองส่งเสียงจริงและเสียงช่วย ฟังซ้ำ และเปิดอักษรประกอบเสียง
3. ทดสอบพัก กลับล็อบบี และครบ 5 ผนึก
4. เปลี่ยนเป็น AI ให้สองบทบาทโหลดโมเดล เปิดกล้อง และกดพร้อมด้วย fingerprint เดียวกัน
5. ทดลองกล้องจริงอย่างน้อย 10 ครั้ง บันทึกทั้งสำเร็จและผิดพลาด

หากเว็บขึ้นแต่ห้องสร้างไม่ได้ ให้ตรวจ D1 binding/migration; ถ้าเฉพาะเสียงเสียให้ตรวจ BUCKET/R2; ถ้าเฉพาะกล้องตรวจไม่ได้ให้ตรวจ manifest, ONNX/runtime assets, HTTPS, CORS และ browser console

ดู log ของ Worker ได้ด้วย `pnpm exec wrangler tail --config wrangler.production.jsonc` หลีกเลี่ยงการเพิ่ม log ที่พิมพ์ token หรือภาพผู้เล่น

อ้างอิง: [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [R2 lifecycle](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)
