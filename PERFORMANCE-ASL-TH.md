# แก้ WASM ช้าและต้องยกมือใกล้กล้อง

## สิ่งที่เปลี่ยน

ค่าเริ่มต้นใช้ ONNX input **384×384** ที่ export ใหม่จาก `best.pt` เดิม และเก็บรุ่น **640×640** ให้เลือกใน “ตั้งค่าโมเดลของทีม → ขนาดโมเดล” ทั้งสองรุ่นใช้ float32 และ class A–Z/nothing เหมือนเดิม ไม่ได้ retrain หรือ quantize โมเดล

ก่อนปรับ Python เปิดกล้อง 1280×720, mirror ก่อนทำนาย, confidence 0.50 และเลือก CUDA/half เมื่อมี GPU ส่วนเว็บเดิมขอ 640×480, ไม่ mirror ก่อนทำนาย, confidence 0.75 และ WASM ถูกบังคับ 1 เธรด จึงเป็นการเปรียบเทียบคนละ pipeline และ backend

อีกจุดคือ `.pt` ใน `model.predict` ใช้ minimum-rectangle padding เมื่อรองรับ จึงอาจคำนวณ tensor เล็กกว่า 640×640 แม้ตั้ง imgsz=640 ส่วน ONNX เดิมเป็น fixed square เสมอ ตาม [Ultralytics Predict](https://docs.ultralytics.com/modes/predict/#fixed-shape-vs-minimum-rectangle-rect) การตรวจ parity ในรายงานส่ง tensor เดียวกันและใช้ end-to-end head ให้ตรงกับ export ไม่ได้อ้างว่าเหมือนทุกค่า default ของ webcam Python

เว็บรุ่นนี้:

- ขอภาพกล้อง 1280×720 ที่ 30 fps โดยขนาดจริงขึ้นอยู่กับกล้อง
- ใช้ MediaPipe หามือหนึ่งข้าง แล้วขยายบริเวณมือพร้อมพื้นที่รอบนิ้วและข้อมือก่อนย่อเข้าโมเดล ช่วยไม่ให้มือที่อยู่ไกลเล็กเกินไปใน input 384
- กลับภาพก่อนทำนายและแปลงตำแหน่งมือให้ตรงกัน ใช้ confidence **0.50** เหมือนสคริปต์ Python
- เปิด WASM สูงสุด 4 เธรด ไม่เกินครึ่ง logical CPU เมื่อ `crossOriginIsolated` พร้อม; หากไม่พร้อมใช้ 1 เธรด
- ลดความถี่ MediaPipe ขณะรอ ONNX เป็นทุก 250 ms และใช้ input buffer เดิมซ้ำ ลดการแย่ง CPU/การจองหน่วยความจำ
- แสดงเวลา “หามือ / เตรียมภาพ / ONNX / รวม” พร้อมจำนวนเธรด ขนาดภาพ และสาเหตุที่ใช้ WebGPU ไม่ได้ในรายละเอียด

ยังต้องอ่านอักษรเดิมอย่างน้อย 3 ครั้งและถือท่าอย่างน้อย 900 ms ผลเก่ากว่า 1.5 วินาทีไม่ถูกใช้ยืนยัน ค่าความมั่นใจที่ต่ำลงอาจรับผลผิดเพิ่มในสภาพจริง จึงต้องทดลองกับกล้องของผู้ใช้ด้วย

## ผลที่วัดได้

Chromium 155 บน Windows เครื่องทดสอบเดียวกัน ใช้ภาพ test ที่กำหนดไว้ 54 ภาพ ไม่เปิดกล้องและไม่รัน MediaPipe ระหว่าง benchmark:

| รุ่น / โหมด | Backend จริง | เธรด | median | p95 |
|---|---|---:|---:|---:|
| 640 / WASM | WASM | 4 | 282 ms | 360 ms |
| 640 / Auto | WASM หลังลอง WebGPU | 4 | 286 ms | 321 ms |
| 384 / WASM | WASM | 4 | **44 ms** | 98 ms |
| 384 / Auto | WASM หลังลอง WebGPU | 4 | **50 ms** | 65 ms |
| 384 / ไม่มี isolation | WASM | 1 | 105 ms | 171 ms |

เวลานี้รวมส่ง ImageBitmap, เตรียมภาพ และ ONNX จนได้ผลกลับมา แต่ไม่รวมโหลดโมเดล, decode ภาพต้นฉบับ, กล้อง หรือ MediaPipe ค่า “รวม” บนหน้าเล่นจึงสูงกว่านี้ได้ และไม่รับประกันว่าแต่ละเครื่องจะได้ 44 ms

การเพิ่มเธรดอย่างเดียวไม่ช่วยในรอบทดสอบ 640: รุ่นเดิม 1 เธรดเคยได้ median 256 ms จึงเลือกใช้ input 384 เป็นตัวลดภาระหลัก รายงานก่อนปรับอยู่ใน `docs/testing/asl-browser-before-performance.json`

เปรียบเทียบ tensor เดียวกันระหว่าง `.pt` กับ ONNX ผ่าน **54/54** ทั้งสองขนาด และ browser WASM เทียบกับ CPU reference ผ่าน **54/54** ทั้งโหมด WASM และ Auto

- รุ่น 384: อักษรถูก 49/52, งดตอบ 3; nothing งดตอบ 2/2
- รุ่น 640: อักษรถูก 50/52, งดตอบ 2; nothing งดตอบ 2/2
- ไม่พบการตอบอักษรผิดในชุดตัวอย่างที่ยอมรับ แต่ชุดนี้ไม่ใช่การวัด accuracy ทั้ง dataset หรือการใช้กล้องจริง
- JPEG ต้นฉบับ 27 ภาพของรุ่น 384 ตรงกับ CPU reference 26/27; ภาพที่ต่างคือ Z ซึ่ง browser อ่าน Z ได้ แต่ reference งดตอบใกล้ threshold เพราะวิธี resize ต่างกัน
- ภาพจำลองมือเล็กของรุ่น 384 ที่ confidence 0.50: full-frame ตรง annotation 10/54 และตอบผิด 6; hand-crop ตรง 49/54 และไม่พบคำตอบผิด ชุดนี้ใช้ annotation แทน MediaPipe และฝังภาพบนพื้นสีเทา จึงไม่ใช่การยืนยันระยะทางจริงเป็นเมตร

รายงาน: [384](docs/testing/asl-browser-validation.json), [640](docs/testing/asl-browser-validation-640.json), [เทียบ checkpoint](docs/testing/asl-model-validation.json), [มือเล็กจำลอง](docs/testing/asl-distance-diagnostic-384.json)

## อัปเดตเว็บเดิม

1. แตก `sanzaru-onnx-performance.zip` ลงโฟลเดอร์ใหม่
2. นำ `wrangler.production.jsonc` ของบัญชีเดิมมาไว้ข้าง `dist/` ใช้ D1/R2 และชื่อ Worker เดิม
3. รันคำสั่งด้านล่าง ชุดนี้ไม่เปลี่ยน schema ฐานข้อมูล

```powershell
npx wrangler@4.92.0 deploy --dry-run --config wrangler.production.jsonc
npx wrangler@4.92.0 deploy --config wrangler.production.jsonc
```

อัปโหลดทั้ง `dist/server` และ `dist/client` รวม `_headers` เพราะ SSR และไฟล์ Worker ต้องส่ง COOP/COEP ครบ การอัปโหลดเฉพาะไฟล์ ONNX จะไม่แก้จำนวนเธรดหรือ pipeline กล้อง

หลัง deploy กด Ctrl+Shift+R ทุกเครื่อง เปิด `/lab` เลือก “384 · เร็ว” แล้วกดใช้การตั้งค่านี้และเปิดกล้อง ดูว่าขึ้น WASM CPU 2–4 เธรด ถ้ายังเป็น 1 เธรด ดูข้อความ COOP/COEP ในรายละเอียด หรือเบราว์เซอร์อาจมี logical CPU น้อย

Iwazaru และ Mizaru ต้องใช้ขนาดโมเดลและ manifest เดียวกัน รุ่นนี้เปลี่ยน fingerprint ให้กลับล็อบบี/สร้างห้องใหม่และเชื่อมโมเดลใหม่ทั้งสองคน หาก 384 อ่านบางอักษรยาก ให้ลอง 640 จากเมนูเดียวกัน

ถ้า ms ยังสูง ให้ดูเวลาที่แยกไว้: ONNX สูงให้ใช้ 384 หรือ Auto ที่เปิด WebGPU ได้; หามือสูงให้ตรวจภาระ CPU; ไม่พบมือเลยให้ตรวจแสงและความคมชัด เพราะการขยายภาพทำงานหลัง MediaPipe พบมือ และไม่สามารถคืนรายละเอียดที่กล้องไม่ได้บันทึก

## โค้ดและการทดสอบ

- `lib/asl-onnx.ts`: crop geometry, mirror ROI, reusable NCHW buffer และ fingerprint adapter v2
- `lib/asl-onnx.worker.ts`: preprocessing, session, WASM threads และเวลารัน ONNX
- `app/asl/use-asl-camera.ts`: กล้อง 720p, hand tracking, latency และรักษาความสดของผล
- `app/asl/camera-panel.tsx`: เลือกขนาดและแสดง diagnostics
- `build/sites-worker.ts`, `public/_headers`, `vite.config.ts`: cross-origin isolation สำหรับ SSR/static/dev
- `scripts/validate-asl-onnx.py`, `scripts/asl_preprocessing.py`: reference crop/mirror และเทียบ `.pt`/ONNX
- `tests/asl-real-browser.mjs`: production Worker กับภาพจริง; `/?single=1` ตรวจ fallback ที่ไม่มี isolation
- `tests/asl-production-page.mjs`: กดปุ่มจริงใน `/lab` และ `/play` ตรวจ origin, warm-up และ isolation โดยบล็อกกล้องส่วนตัว

แนวทาง WASM threads และการวัดประสิทธิภาพอ้างอิง [ONNX Runtime Performance Diagnosis](https://onnxruntime.ai/docs/tutorials/web/performance-diagnosis.html) และ [Environment flags](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html) ซึ่งระบุว่าหลายเธรดต้องมี cross-origin isolation และประสิทธิภาพขึ้นกับโมเดล/อุปกรณ์
