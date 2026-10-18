# Performance update — 18 ตุลาคม 2026

ผ่าน typecheck, 11 test scripts, Python exporter tests, production build, lint ของไฟล์ที่เปลี่ยน (ไม่มี error), checkpoint parity ทั้ง 384/640 และ browser WASM ทั้งแบบ 1/4 เธรด ตรวจหน้า /lab และ /play ด้วย emitted client จริงและ crossOriginIsolated=true ทั้ง document/Worker ดู [PERFORMANCE-ASL-TH.md](PERFORMANCE-ASL-TH.md) สำหรับตัวเลขล่าสุด

**ขอบเขตของ ZIP รุ่น performance:** หลังตรวจหน้าเว็บ มีการลบ import ที่ไม่ได้ใช้และเพิ่มคำอธิบายข้อยกเว้น lint แล้ว build ใหม่ ทำให้ hash ของ camera-panel เปลี่ยน ผู้ใช้ขอให้ส่งมอบโดยไม่เพิ่มรอบทดสอบ จึงเก็บรายงานหน้าเว็บเดิมตามจริงและไม่อ้างว่าได้กดทดสอบ client chunk สุดท้ายซ้ำ การแพ็กยังตรวจไฟล์ build, URL ของ Worker, โมเดล/runtime และ checksum ทั้ง ZIP; `PACKAGING-REPORT.json` ใน ZIP ระบุข้อยกเว้นนี้และ hash ของ chunk ปัจจุบัน

รายงานช่วงก่อนหน้าในไฟล์นี้บันทึกขอบเขตของแต่ละรอบ หากตัวเลขต่างกันให้ใช้รายงาน performance และ JSON รุ่นปัจจุบัน

# Verification — SANZARU ONNX Runtime Web

## แก้ไข Worker URL หลัง deploy — 18 ตุลาคม 2026

พบว่า Vinext แปลง `import.meta.url` เป็น file URL ใน client bundle แม้ Worker/runtime tests ก่อนหน้าจะผ่าน แก้ด้วย Vite `?worker&url` และเพิ่มการตรวจ emitted client constructor ใน `pnpm check:deploy` โดย regression check ล้มเหลวกับ bundle เดิมจริง

TypeScript, ชุดทดสอบ 11 scripts และ production build ผ่านหลังแก้ ตรวจ `/lab` กับ `/play` ผ่าน production-page harness ซึ่งใช้ client bundle จริงและปฏิเสธกล้องหลัง ONNX warm-up ดูผลที่ `docs/testing/asl-production-page.json` และ [คู่มืออัปเดต](WORKER-URL-FIX-TH.md)

รายงาน runtime/ความแม่นยำด้านล่างยังใช้โมเดลเดิม การผ่าน test ตัวโหลด Worker เดิมไม่ได้ยืนยันเส้นทางสร้าง Worker ของหน้าเว็บ จึงเพิ่มการตรวจหน้าเว็บโดยตรงในรอบนี้

ตรวจการเปลี่ยนระบบ inference วันที่ 18 ตุลาคม 2026 ด้วย Node 24.4.1, pnpm 11.25.0, Python 3.12 และ ONNX Runtime Web 1.30.0

## ผ่านแล้วในงานนี้

| การตรวจ | ผลและขอบเขต |
|---|---|
| `pnpm install --offline --frozen-lockfile` | ผ่าน ติดตั้งซ้ำด้วย lockfile และ build policy ที่ระบุชัดเจน |
| `pnpm typecheck` | ผ่าน ไม่มี TypeScript error |
| `pnpm test` | ผ่านทั้ง 10 scripts รวม legacy, ASL room/API, SSR และ ONNX decoding |
| `pnpm build` | ผ่าน client, RSC และ SSR; สร้าง dedicated Worker และคัดลอก runtime assets |
| `python -m unittest discover -s tests -p test_export_asl_onnx.py` | ผ่าน 3 tests: class order, exact mapping และ output shape validation |
| Browser integration จาก source | ผ่าน WASM inference, class mapping, threshold, hash mismatch และ cancellation |
| Browser integration จาก production Worker/runtime | ผ่านกรณีเดียวกันด้วยไฟล์ใน dist/client |
| Automatic fallback | Browser ทดสอบสร้าง WebGPU session ไม่สำเร็จ แล้ว fallback เป็น WASM และทำนายสำเร็จ |
| Export checkpoint จริง | YOLO26n, Ultralytics 8.4.181, opset 17, float32, input [1,3,640,640], output [1,300,6] |
| Checkpoint เทียบ ONNX CPU | ผ่าน 54/54 ภาพที่เลือกก่อนทำนาย ครบ 27 class; ตรวจ class/box/confidence ที่ผ่าน threshold |
| โมเดลจริงผ่าน production browser Worker | ผ่าน parity 54/54 ทั้ง WASM และ auto→WASM; JPEG ต้นฉบับตรงกันอีก 27/27 ต่อโหมด |
| `pnpm test:asl:local` | ผ่าน built Worker + local D1/R2: 3 คนครบ 5 ด่าน, แยกเฉลย, เก็บ/อ่านเสียงและตรวจสิทธิ์ |
| `pnpm check:deploy` | ผ่าน ขนาด assets, SHA-256 ของโมเดล/WASM, compiled Worker, MediaPipe และ migration |
| `wrangler deploy --dry-run` | ผ่าน 65 modules, Worker gzip ประมาณ 322 KiB; ไม่มีการส่งขึ้นบัญชีจริง |

ผลโมเดลจริงและวิธีทำซ้ำอยู่ใน [MODEL-REPORT-TH.md](MODEL-REPORT-TH.md) และ JSON ใน `docs/testing/` รุ่น 384 + crop/mirror + threshold 0.50 ให้คำตอบถูก 49/52 ภาพอักษร อีก 3 ภาพงดตอบ และภาพ nothing 2 ภาพงดตอบ ตัวเลข parity 54/54 ยืนยันความสอดคล้องของการแปลง ไม่ใช่ accuracy 100%

## สิ่งที่ browser test สังเคราะห์ตรวจ

ใช้โมเดล ONNX สังเคราะห์ขนาดเล็กซึ่ง confidence คำนวณจาก mean ของ input จึงเปลี่ยนผลเมื่อส่งภาพสีขาวกับสีดำ ไม่ใช้กล้องและไม่บันทึกโมเดลทดสอบเป็นโมเดล ASL ของเกม

- เปิด dedicated Worker, โหลด JavaScript และรวม WASM สองส่วนกลับเป็น bytes เดิม
- โหลด ONNX, ตรวจ hash, สร้าง session และ warm-up
- ส่ง ImageBitmap ผ่าน Worker, เตรียม input และเรียก ONNX Runtime จริง
- ภาพสว่างผ่าน confidence และอ่าน class ID ตาม mapping; ภาพมืดถูกปฏิเสธ
- โหมดบังคับ WASM กับ auto/fallback ให้ model fingerprint ตรงกัน
- manifest ที่ระบุ hash ผิดถูกปฏิเสธ
- ปิด Worker ระหว่างโหลดทำให้ promise จบด้วยการยกเลิก

การตรวจสำเร็จนี้ยืนยันเส้นทาง WASM และ fallback ไม่ได้ยืนยันการคำนวณบน GPU จริง เพราะ WebGPU ใช้งานไม่ได้ใน browser ทดสอบ

## ชุดทดสอบโค้ด

ONNX unit tests ตรวจ RGB/255 และ NCHW, letterbox สำหรับภาพแนวนอน/แนวตั้ง, unletterboxing, output end2end/raw-bcn/raw-bnc, class-aware NMS, neutral class, invalid scores/boxes, hand association และการเปลี่ยน fingerprint เมื่อ mapping/ค่าประมวลผลเปลี่ยน

ASL room tests ใช้ HTTP handlers จริงกับ SQLite D1 adapter และ R2 mock ตรวจสิทธิ์ทั้งสามบทบาท การไม่ส่งเฉลยให้คนกลาง/ผู้รับ replay/concurrency การส่งเสียง model agreement และการเล่นครบห้าด่าน รวมรอบที่มี J/Z เป็น image classes และการปฏิเสธอักษรที่อยู่นอก capabilities

SSR tests ตรวจห้าหน้าหลักและลิงก์/assets ใน HTML ส่วน stabilizer tests ตรวจ capture time, stale/duplicate frames, การเปลี่ยนอักษร และ reset

## วิธีรันทดสอบซ้ำ

```powershell
pnpm typecheck
pnpm test
pnpm build
python -m unittest discover -s tests -p test_export_asl_onnx.py
node tests/asl-browser-smoke.mjs --built
```

เปิด `http://127.0.0.1:8791` แล้วกด Run tests ต้องเห็น `ALL PASSED` จากนั้นหยุดเซิร์ฟเวอร์ด้วย Ctrl+C ถ้าต้องการทดสอบ TypeScript source โดยตรงให้ตัด `--built` ออก

## ยังไม่ได้ตรวจ

- ยังไม่ได้ประเมิน mAP ใหม่บน test set ทั้งหมด หรือวัด FPS ของกล้องรวม MediaPipe และ UI
- ยังไม่ได้ทดสอบ inference ที่สำเร็จบน WebGPU/GPU จริง
- ยังไม่ได้ทดสอบเปิดกล้อง/ไมค์จริง การจับมือจริง หรือ UI เกมครบสามเครื่องผ่านอินเทอร์เน็ต
- ยังไม่ได้ deploy Cloudflare/R2 จริง
- ยังไม่ได้ทดสอบกับผู้พิการ ผู้ใช้ ASL หรือทำ accessibility audit
- Python API รุ่นก่อนเก็บเป็นโค้ดอ้างอิงและไม่ได้รันทดสอบ Python API ซ้ำในงานนี้ รายงานเก่าอยู่ที่ docs/archive/TESTING-3.0-PYTHON.md

## ก่อนนำเสนอด้วยโมเดลจริง

1. ชุดนี้มี ONNX + manifest จริงแล้ว ถ้าเปลี่ยนโมเดลให้ export และ build ใหม่
2. ถ้าเปลี่ยนโมเดลให้รัน `scripts/validate-asl-onnx.py` และ `tests/asl-real-browser.mjs` ซ้ำ
3. ทดสอบ /lab ด้วยกล้องจริงทั้ง WASM และ WebGPU บันทึกผลถูก/ผิดและ latency
4. ทดสอบ Iwazaru/Mizaru พร้อมกันด้วยโมเดลเดียวกันและเล่นครบห้าด่าน
5. ทดลองปิดกล้อง เปลี่ยนแท็บ โหลดใหม่ เปลี่ยนโมเดล และส่งเสียง
6. ประเมินร่วมกับผู้ใช้เป้าหมายก่อนอ้างผลด้านการเข้าถึงหรือการเรียนรู้
