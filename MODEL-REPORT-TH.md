# โมเดล ASL ที่พร้อมใช้ใน SANZARU

วันที่ตรวจ 18 ตุลาคม 2026 แปลง checkpoint ของทีมสำเร็จและรวมใน production assets แล้ว ไม่ต้องติดตั้ง Python บน Cloudflare หรือเครื่องผู้เล่น

## ไฟล์และการตั้งค่า

| รายการ | ค่า |
|---|---|
| ต้นฉบับ | `ASL.v2-aslv2.yolo26/asl_runs/yolo26n_asl/weights/best.pt` |
| สำเนา export ข้างต้นฉบับ | `ASL.v2-aslv2.yolo26/asl_runs/yolo26n_asl/weights/best.onnx` |
| ไฟล์สำหรับเว็บ | 384: `public/models/asl/asl-6b0147a82a49c384.onnx`; 640: `public/models/asl/asl-a292af0d4b17e9b7.onnx` |
| Manifest | `public/models/asl/manifest.json` |
| ขนาด | 384: 9,733,962 bytes; 640: 9,841,486 bytes |
| โมเดล | YOLO26n detect, float32, ONNX opset 17 |
| Input | `images`: [1, 3, S, S] fixed; S = 384 หรือ 640, hand-crop + mirror + RGB/255 + NCHW + letterbox สี 114 |
| Output | `output0`: [1, 300, 6], end-to-end [x1,y1,x2,y2,confidence,classId] |
| Class | ID 0–25 = A–Z; ID 26 = nothing → null |
| Threshold | confidence 0.50; overlap กับมือ ≥0.2; head นี้ไม่ต้องทำ NMS ซ้ำ |
| Runtime เว็บ | ONNX Runtime Web 1.30.0, dedicated Worker, WASM 1–4 threads; auto ลอง WebGPU ก่อน |

SHA-256 ของ checkpoint:
`cdbf97c2bb8b6c0e3c18ff08a0548f7b3d78ff5d40f4a8b3222ccd311422b36d`

SHA-256 ของ ONNX รุ่น 384:
`6b0147a82a49c3845a3f435952d3831ed6a75510670cf584145d9f1cf1ede100`

SHA-256 ของ ONNX รุ่น 640:
`a292af0d4b17e9b744952b2fdee971a379a7064703d77fc23cc8424167500581`

ไฟล์ best.pt ไม่ถูกแก้ไข ใช้ Ultralytics 8.4.181 ตรงกับ environment ฝึกที่แนบมา แต่ export บน Python 3.12.6, PyTorch 2.9.1+cpu และ ONNX 1.23.2 เครื่องนี้มี environment ใหม่ `.venv-export` เพราะ environment เดิมอ้าง Python ของอีกเครื่อง

## ผลตรวจการแปลง

เลือกภาพจาก test split โดยเรียงชื่อไฟล์ แล้วเลือก 2 ภาพที่มี annotation หนึ่งกล่องต่อ class รวม 54 ภาพ ครบ 27 class เลือกก่อนทำนายและเก็บรายชื่อ/hash ภาพใน [รายงาน JSON](docs/testing/asl-model-validation.json)

ใช้ preprocessing รุ่นใหม่ (hand crop, mirror, threshold 0.50) ส่ง tensor เดียวกันเข้า checkpoint fused FP32/end-to-end และ ONNX CPU 1.31.0 ผลตรงกัน **54/54 ภาพทั้งรุ่น 384 และ 640** ภายใน tolerance 0.02 pixel/0.0001 confidence ดู JSON สำหรับค่าความคลาดเคลื่อนจริง

รุ่น 384 ตอบถูก 49/52 ภาพอักษร งดตอบ 3 และ nothing งดตอบ 2/2; รุ่น 640 ตอบถูก 50/52 งดตอบ 2 และ nothing งดตอบ 2/2 ไม่พบคำตอบอักษรผิดในตัวอย่างที่ยอมรับ ชุดนี้เลือกอย่างกำหนดแน่นอน บางภาพอาจเป็น augmentation ของต้นฉบับเดียวกัน ไม่ใช่ mAP หรือ accuracy ทั้งชุด

## ผลในเบราว์เซอร์

Production Worker + ONNX Runtime Web 1.30.0 บน Chromium 155 / Windows ใช้ annotation เป็นบริเวณมือ ไม่มีการเปิดกล้องหรือเรียก MediaPipe ระหว่าง benchmark

| รุ่น | WASM median (4 เธรด) | p95 | Prepared pixel parity | JPEG agreement |
|---|---:|---:|---:|---:|
| 384 | 44 ms | 98 ms | 54/54 | 26/27 |
| 640 | 282 ms | 360 ms | 54/54 | 27/27 |

Auto ลอง WebGPU แต่เครื่องทดสอบ fallback เป็น WASM: รุ่น 384 median 50 ms; รุ่น 640 median 286 ms ไม่มีผล benchmark บน GPU จริง รุ่น 384 แบบไม่มี isolation ใช้ 1 เธรด median 105 ms และ parity 54/54

ภาพ JPEG ที่ต่างในรุ่น 384 คือ Z: browser ได้ Z ส่วน CPU reference งดตอบ เพราะ resize/interpolation ต่างกันใกล้ threshold ไม่ได้เปลี่ยนเป็นอักษรอื่น

เวลารวมการเตรียมภาพและ Worker messaging แต่ไม่รวม fetch/decode ภาพ, MediaPipe หรือ UI ดูรายละเอียดและข้อจำกัดใน [PERFORMANCE-ASL-TH.md](PERFORMANCE-ASL-TH.md)

หลักฐาน: [384](docs/testing/asl-browser-validation.json), [640](docs/testing/asl-browser-validation-640.json), [ภาพผลทดสอบ](docs/testing/asl-real-browser.png)

## ทำซ้ำ

```powershell
.\.venv-export\Scripts\python.exe scripts/validate-asl-onnx.py
pnpm build
node tests/asl-real-browser.mjs
```

เปิด http://127.0.0.1:8792 แล้วกด Run real model tests ต้องเห็น ALL PASSED ระบบเขียนรายงาน browser ลง docs/testing อัตโนมัติ ชุดภาพที่เตรียมไว้เก็บใน .sites-runtime/asl-validation และไม่รวมใน deployment

```powershell
pnpm typecheck
pnpm test
pnpm check:deploy
pnpm db:local
pnpm start
```

เปิดอีก terminal แล้วรัน `pnpm test:asl:local` เพื่อตรวจ 3 บทบาทครบ 5 ด่านกับ D1/R2 ในเครื่อง เสียงใน test เป็น bytes จำลองสำหรับตรวจ storage/สิทธิ์ ไม่ใช่การอัดหรือฟังจริง

## ขอบเขตก่อนใช้งานจริง

- ยังไม่ได้ตรวจกล้อง/ไมค์จริง ท่าในสภาพแสงต่าง ๆ หรือเกมสามเครื่องบนอินเทอร์เน็ต
- ยังไม่ได้ยืนยัน WebGPU ที่คำนวณสำเร็จ; เส้นทาง WASM และ fallback ผ่านแล้ว
- J/Z เป็น class จากภาพ ไม่ใช่การตรวจลำดับการเคลื่อนไหวของ ASL
- ชุดอัปเดตรอบนี้ยังไม่ได้ deploy เข้าบัญชี Cloudflare ใช้ config บัญชีเดิมตามคู่มือ

Dataset metadata ที่แนบมาระบุ Roboflow workspace `0722s-workspace`, project `asl-9evyq`, version 2 และ license CC BY 4.0: [หน้า dataset](https://app.roboflow.com/0722s-workspace/asl-9evyq/2) ข้อมูลนี้เป็น attribution ของชุดข้อมูล ไม่ใช่การสรุป license ของ dependencies หรือ weights ทั้งหมด

รายละเอียดอ้างอิง: [Ultralytics ONNX export](https://docs.ultralytics.com/integrations/onnx/), [ONNX Runtime Web deployment](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
