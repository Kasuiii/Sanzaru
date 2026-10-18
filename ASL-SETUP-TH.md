# ตั้งโมเดล ASL สำหรับ ONNX Runtime Web

หน้า `/play` และ `/lab` ตรวจภาพในเบราว์เซอร์แล้ว ผู้เล่นไม่ต้องเปิด AI server แยก Python ใช้เฉพาะเครื่องที่ export โมเดลครั้งแรก

คำอธิบายสถาปัตยกรรมและโค้ดทั้งหมดอยู่ที่ [ONNX-RUNTIME-WEB-TH.md](ONNX-RUNTIME-WEB-TH.md)

## 1. เตรียมไฟล์จริง

ชุดนี้เตรียมโมเดลจริงให้แล้ว: `public/models/asl/asl-a292af0d4b17e9b7.onnx` และ `manifest.json` สามารถข้ามไปขั้นเปิดเว็บได้ ไม่ต้องติดตั้ง Python สำหรับการเล่นหรือ deploy

ต้นทางคือ `ASL.v2-aslv2.yolo26/asl_runs/yolo26n_asl/weights/best.pt` และมีสำเนา export ที่ `best.onnx` ข้างไฟล์เดิม อ่านผลตรวจและ hash ใน [MODEL-REPORT-TH.md](MODEL-REPORT-TH.md) ขั้นถัดไปใช้เมื่อต้องการ export ใหม่หรือเปลี่ยนโมเดล

## 2. ติดตั้งและ export บน Windows

เปิด PowerShell ที่ root ของโปรเจกต์ ใช้ Python environment ที่มีเวอร์ชัน Ultralytics/PyTorch ตรงกับตอนฝึกถ้ามีอยู่แล้ว หรือสร้าง environment สำหรับ export:

```powershell
python -m venv .venv-export
.\.venv-export\Scripts\python.exe -m pip install -r ai-server/requirements-export.txt
.\.venv-export\Scripts\python.exe scripts/export-asl-onnx.py --model ASL.v2-aslv2.yolo26/asl_runs/yolo26n_asl/weights/best.pt --class-map models/asl-class-map.json
```

`requirements-export.txt` ระบุ Ultralytics 8.4.181 ตรงกับชุดฝึก การ export ครั้งนี้ใช้ Python 3.12.6/PyTorch CPU 2.9.1; environment เดิมในโฟลเดอร์ dataset ย้ายมาจากเครื่องอื่น จึงสร้าง `.venv-export` แยกไว้ ไม่แก้ `best.pt`

เมื่อทำเสร็จจะมี:

```text
public/models/asl/
  asl-<hash16>.onnx
  manifest.json
```

สคริปต์ตรวจ task, float32, fixed square input, output shape, class ID และสร้าง SHA-256 อัตโนมัติ ไฟล์ ONNX ใช้ชื่อมี hash เพื่อลดปัญหาแคชรุ่นเก่า

ค่า export เริ่มต้น: `imgsz=640`, `batch=1`, `dynamic=False`, `half=False`, `simplify=False`, `opset=17`, `nms=False` หลัง export จะอ่าน graph จริงว่าผลเป็น end2end หรือ raw จึงรองรับความต่างของเวอร์ชันโดยไม่เดา tensor layout

หากต้องการขนาดเล็กลงเพื่อทดลองความเร็ว:

```powershell
.\.venv-export\Scripts\python.exe scripts/export-asl-onnx.py --model ai-server/models/asl-best.pt --imgsz 320
```

หากต้องการ raw head ตาม API ของ Ultralytics ที่รองรับ `nms=None`:

```powershell
.\.venv-export\Scripts\python.exe scripts/export-asl-onnx.py --model ai-server/models/asl-best.pt --raw
```

เปรียบเทียบความแม่นยำก่อนเลือกขนาด/head ใช้งานจริง ชื่อ `nms` และการ export ของ Ultralytics อาจต่างกันระหว่างรุ่น หาก export error ให้ใช้ environment รุ่นที่ฝึกและตรวจเอกสารของรุ่นนั้น

## 3. ถ้ามี ONNX อยู่แล้ว

ใช้ ONNX สำหรับ Ultralytics detect แบบ float32 ซึ่งมี metadata `task=detect` และ `names`:

```powershell
.\.venv-export\Scripts\python.exe scripts/export-asl-onnx.py --from-onnx path/to/best.onnx
```

เส้นทางนี้ต้องใช้แพ็กเกจ `onnx` แต่ไม่โหลด PyTorch/Ultralytics ตัวสคริปต์ไม่เปลี่ยน graph จึงต้องเป็น preprocessing แบบ RGB/255/NCHW letterbox (เลือก full-frame หรือ hand-crop ใน manifest) และ output ตามตารางในเอกสารสถาปัตยกรรม ไม่รองรับ ONNX ทั่วไปทุกแบบหรือ external tensor data

## 4. ชื่อ class และอักษร A–Z

ชุดปัจจุบันใช้ `models/asl-class-map.json`: ID 0–25 คือ A–Z และ ID 26 คือ `nothing` ที่ map เป็น `null` ต้องส่ง mapping นี้เมื่อ export ใหม่ ลำดับ class อ่านจากโมเดลจริง ไม่เรียงใหม่ตามอักษร

ถ้าชื่อเป็น `A-sign`, `letter_b`, `nothing` ฯลฯ ให้สร้าง JSON ที่ map **ทุกชื่อ class จริง** ไปเป็นอักษรพิมพ์ใหญ่หนึ่งตัว หรือ `null` สำหรับ class ที่ไม่ใช้ ตัวอย่างโมเดลที่มี 6 class:

```json
{
  "A-sign": "A",
  "B-sign": "B",
  "C-sign": "C",
  "L-sign": "L",
  "Y-sign": "Y",
  "nothing": null
}
```

แล้ว export พร้อม:

```powershell
.\.venv-export\Scripts\python.exe scripts/export-asl-onnx.py --model ai-server/models/asl-best.pt --class-map path/to/class-map.json
```

ต้องมีอักษรต่างกันอย่างน้อย 5 ตัว เกมเลือกได้ A–Z ตามความสามารถของโมเดล ตัว J/Z ยังเป็นการตรวจ class จากภาพ ไม่ตรวจเส้นทางการเคลื่อนไหว อย่าแปลผลว่าเป็นระบบรับรองการทำ ASL ครบรูปแบบ

## 5. เปิดเว็บ

```powershell
pnpm install --frozen-lockfile
pnpm setup:local
pnpm start
```

เปิด `http://localhost:8787/lab` แล้วกด **เชื่อมโมเดลและเปิดกล้อง** ค่าเริ่มต้น manifest คือ `/models/asl/manifest.json` หน้าเว็บดาวน์โหลดและ warm-up โมเดลก่อนขอเปิดกล้อง หากไม่พบไฟล์จะแสดง error แทนผลทำนาย

`setup:local` ทำ build และ migration ในเครื่อง ระหว่าง build สคริปต์เตรียม runtime ให้อัตโนมัติ ถ้าใช้ `pnpm dev` ก็เตรียม runtime ให้เช่นกัน หลังเพิ่ม/เปลี่ยนไฟล์โมเดลสำหรับ `pnpm start` ต้อง build ใหม่เพราะโหมดนี้ใช้ไฟล์ใน `dist/client`

คำสั่งเตรียม runtime โดยตรงคือ:

```powershell
pnpm prepare:onnx
```

Python ปิดได้หลัง export ผู้เล่นคนอื่นไม่ต้องติดตั้ง Python, Node หรือ pnpm หากเข้าผ่านเว็บที่ deploy แล้ว

## 6. ตั้งค่าในหน้ากล้อง

เปิด **ตั้งค่าโมเดลของทีม**:

- **ไฟล์กำกับโมเดล**: ใช้ค่าเริ่มต้น หรือ HTTPS URL ของ manifest ที่ทีมเตรียม
- **การประมวลผล**: อัตโนมัติลอง WebGPU และใช้ WASM สำรอง หรือบังคับ WASM เพื่อทดลอง CPU
- กด **ใช้การตั้งค่านี้** แล้วเปิดกล้องใหม่

ค่าตั้งจำเฉพาะใน browser นี้ ไม่มี API token สำหรับการตรวจภาพ ใช้หนึ่งมือในภาพและถือท่าจนแถบความนิ่งเต็มก่อนกดยืนยัน

## 7. เล่นร่วมกัน

1. ทั้งสามคนเข้า URL เว็บเดียวกันแล้วสร้าง/เข้าห้อง
2. เจ้าของห้องเลือกอักษรอย่างน้อย 5 ตัวที่โมเดลรองรับ
3. Iwazaru และ Mizaru เปิดโมเดลชุดเดียวกันและกล้อง ระบบตรวจ model fingerprint
4. ทั้งสามกดพร้อมแล้วเจ้าของห้องเริ่ม
5. Kikazaru ขออักษร → Iwazaru ทำมือและยืนยันผล → Kikazaru ส่งเสียง → Mizaru ทำมือและยืนยัน
6. ตอบตรงเฉลยครบ 5 ด่านจบรอบ ลองผิดแล้วตอบใหม่ได้

Iwazaru/Mizaru ใช้ WebGPU กับ WASM ต่างกันได้ แต่โมเดล mapping และ thresholds ต้องตรงกัน การเปลี่ยนโมเดลหลังเริ่มเกมต้องกลับล็อบบี

## 8. รูปแบบ manifest

ตัวอย่างต่อไปนี้แสดงโครงสร้างเท่านั้น ค่า hash ต้องสร้างจากไฟล์จริง:

```json
{
  "schema": 1,
  "model": "asl-<hash16>.onnx",
  "sha256": "<SHA-256 64 ตัวของไฟล์ ONNX จริง>",
  "task": "detect",
  "inputSize": 640,
  "inputName": "images",
  "outputName": "output0",
  "outputFormat": "end2end",
  "labels": ["A", "B", "C", "L", "Y"],
  "confidence": 0.50,
  "inputMode": "hand-crop",
  "mirror": true,
  "iou": 0.45,
  "associationOverlap": 0.2
}
```

`labels[i]` คือ class ID i ใช้ `null` แทน class ที่ไม่ต้องการ `confidence` มีช่วง 0.50–1; `iou` ใช้เฉพาะ output raw; `associationOverlap` ใช้จับคู่กล่อง YOLO กับมือ ค่า input/output/labels ห้ามคัดลอกตามตัวอย่างหากไม่ตรงกับโมเดลจริง

## 9. Deploy

ทำตาม [DEPLOY-CLOUDFLARE-TH.md](DEPLOY-CLOUDFLARE-TH.md) สำหรับ Workers/D1/R2 โดยไม่ต้องตั้ง Python API

ไฟล์ runtime และโมเดลอยู่ใน `public/` ตอน build และถูกคัดลอกไป `dist/client/` โฟลเดอร์ `public/onnx/` สร้างอัตโนมัติ ส่วนไฟล์ ONNX และ manifest ถูก ignore ใน Git เพื่อไม่เผลอ commit weights ถ้า build บน CI ต้องจัดหาสองไฟล์นี้ก่อน build

ถ้าโมเดลเกิน 25 MiB ให้ย้ายไฟล์ ONNX ออกจาก `public/` ไปที่ R2 bucket สำหรับโมเดลหรือ CDN แบบ public ที่เปิด CORS ให้เว็บเกม แล้วเปลี่ยน `manifest.model` เป็น HTTPS URL ของไฟล์นั้น `sha256` ใช้ค่าเดิมหาก bytes ไม่เปลี่ยน อย่าเปิด public bucket เสียงที่มีข้อมูลผู้เล่นเพื่อใช้เก็บโมเดล

ส่ง manifest จาก origin อื่นได้เมื่อเปิด CORS ด้วย Runtime JavaScript/WASM ยังโหลดจาก origin ของเกมเท่านั้น URL ที่ตั้งไม่ใช่ endpoint สำหรับส่งภาพ

## 10. แก้ปัญหา

| อาการ | ตรวจอะไร |
|---|---|
| 404 manifest/ONNX | export แล้วหรือยัง อยู่ใน public/models/asl หรือไม่ และ build ใหม่แล้วหรือยัง |
| 404 runtime / WASM hash ผิด | รัน pnpm prepare:onnx และ build/deploy ใหม่ทั้งชุด อย่าผสมไฟล์ runtime คนละรุ่น |
| SHA-256 ของโมเดลไม่ตรง | อัปโหลด manifest และ ONNX คู่เดียวกัน ตรวจว่าเซิร์ฟเวอร์ไม่ได้คืนหน้า HTML แทนไฟล์ |
| Failed to fetch | URL, HTTPS, CORS และเครือข่ายของที่เก็บโมเดล |
| Input/output ไม่ตรง | ใช้สคริปต์ export กับโมเดล detect จริง; ไม่รองรับ FP16, dynamic, segmentation หรือ classifier |
| WebGPU ใช้ไม่ได้ | ใช้ WASM สำรองอัตโนมัติตอนโหลด หรือเลือก WASM เอง |
| เปิดกล้องไม่ได้ | ใช้ HTTPS/localhost อนุญาตกล้อง และตรวจว่าอุปกรณ์ถูกแอปอื่นใช้อยู่หรือไม่ |
| ตรวจช้า/ไม่ขึ้นพร้อมยืนยัน | ดู latency ลดขนาดโมเดลหรือ imgsz แล้ว export ใหม่ ผลเกิน 1.5 วินาทีจะไม่ถูกยอมรับ |
| มือหายหรือถูกปฏิเสธ | ใช้มือเดียว เพิ่มแสง อยู่กลางภาพ และตรวจว่าท่า/ทิศทางตรงกับชุดฝึก |
| สองคนเริ่มเกมไม่ได้ | ตรวจ model fingerprint และอักษรที่ห้องเลือก รวมทั้ง mapping/threshold/runtime รุ่นเดียวกัน |

## 11. ตรวจงาน

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm check:deploy
python -m unittest discover -s tests -p test_export_asl_onnx.py
```

ทดสอบ runtime จริงด้วยโมเดลสังเคราะห์ซึ่งไม่ใช้กล้อง:

```powershell
node tests/asl-browser-smoke.mjs --built
```

เปิด `http://127.0.0.1:8791` กด Run tests แล้วดู ALL PASSED ทดสอบนี้แยกจากโมเดล ASL จริงและไม่บันทึก fixture ลง public/models/asl อ่านผลและข้อจำกัดล่าสุดที่ [TESTING.md](TESTING.md)

รุ่นที่รวมใน repo: `/models/asl/manifest.json` ใช้ input 384 สำหรับ WASM และ `/models/asl/manifest-640.json` ใช้ input 640 ทั้งสองไฟล์ใช้ checkpoint เดียวกัน แต่ fingerprint ต่างกัน ผู้เล่น AI ทั้งคู่ต้องเลือกขนาดเดียวกัน ดู [PERFORMANCE-ASL-TH.md](PERFORMANCE-ASL-TH.md)
