# เชื่อมโมเดล ASL ของคุณ — SANZARU 3.0

## 1. โมเดลที่รองรับ

โค้ดรับ checkpoint `.pt` ของ **Ultralytics YOLO สำหรับ detect หรือ classify** ผ่าน Python API ไม่ได้โหลด PyTorch ในหน้าเว็บหรือ Worker โดยตรง

- `detect`: โมเดลตอบชื่ออักษรพร้อม bounding box ใช้กล่องมือจาก MediaPipe ช่วยตัด detection ที่อยู่นอกมือ
- `classify`: โมเดลตอบ class ของภาพ ต้องตั้งภาพเต็ม/ภาพ crop ให้ตรงกับตอนฝึก
- `.pt` เป็นเพียงนามสกุล ถ้าเป็น `state_dict`, TorchScript, YOLOv5 แบบ repository เก่า หรือ pose model ต้องปรับ `predictor.py` เพิ่มเอง ไม่รับได้ทุกไฟล์
- Roboflow ใช้สร้าง dataset/จัด class/ฝึกโมเดลได้ แต่ไฟล์ที่เอามาใช้ต้องตรงกับ adapter นี้ ชื่อ `best.pt` อย่างเดียวไม่ยืนยันชนิดโมเดล
- API ที่ให้ไม่ได้เรียก Roboflow Hosted API โดยตรง และไม่ต้องใส่ Roboflow API key หากใช้ weights ของคุณเอง

ยังไม่มี ASL weights ของคุณใน ZIP จึงไม่สามารถรายงานความแม่นยำของโมเดลจริงได้

## 2. ตำแหน่งไฟล์

คัดลอกโมเดลที่คุณฝึกไปไว้ที่ **`ai-server/models/asl-best.pt`**

ไฟล์ที่ต้องรู้จัก:

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `ai-server/asl-config.json` | path, ชื่อ class, threshold และชนิดภาพที่ส่ง |
| `ai-server/asl_app.py` | ASL API `/health` และ `/predict` |
| `ai-server/asl_core.py` | map class และเลือกผลที่อยู่ตรงมือ |
| `ai-server/predictor.py` | โหลด `.pt` และเรียก Ultralytics |
| `ai-server/inspect_asl_model.py` | ตรวจ task/class ก่อนเปิดเว็บ |
| `app/asl/use-asl-camera.ts` | กล้อง browser → ภาพ JPEG → API |
| `lib/asl-inference.ts` | ตรวจคำตอบ API และความนิ่ง |

อย่าวาง `.pt` ไว้ใน `public/` เพราะไฟล์ในนั้นถูกเผยแพร่เป็น static asset และโค้ดปัจจุบันไม่ได้อ่าน `.pt` จากตำแหน่งนั้น

## 3. เตรียม Python

แนะนำใช้ Python และ PyTorch/Ultralytics รุ่นเดียวกับที่ฝึกโมเดลก่อน เพื่อให้เปิด checkpoint ได้ตรงกัน ตัวอย่างต่อไปนี้รันจากโฟลเดอร์ `ai-server`

Windows PowerShell:

```powershell
cd ai-server
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe inspect_asl_model.py
```

macOS / Linux:

```sh
cd ai-server
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python inspect_asl_model.py
```

ไม่ต้อง activate virtual environment ถ้าเรียก Python ด้วย path ดังตัวอย่าง ถ้าโมเดลต้องใช้ CUDA ให้ใช้การติดตั้ง PyTorch ที่ตรงกับเครื่องของคุณ ค่าเริ่มต้นใน config เป็น `cpu`

ผล inspect จะแสดง task, classes, supported_static_letters, missing_default_letters และ unmapped_classes ถ้ามี unmapped ให้แก้ mapping ก่อนเริ่มเล่น ไม่ต้องเปลี่ยนไฟล์ TSX

## 4. ตั้งชื่อ class ให้ตรง

เปิด `asl-config.json` ตัวอย่างที่ให้ตั้งเป็นชื่อ class `A` ถึง `Z` แบบตัวใหญ่ หากในโมเดลชื่อ `A-sign` ต้อง map จากชื่อนั้น เช่น:

```json
"class_map": {
  "A-sign": "A",
  "B-sign": "B",
  "C-sign": "C",
  "L-sign": "L",
  "Y-sign": "Y",
  "no-hand": "None",
  "J-sign": "None",
  "Z-sign": "None"
}
```

นี่เป็นเฉพาะส่วน `class_map` ให้คงค่าอื่นของไฟล์เดิมไว้ ต้องใช้ **ชื่อที่ inspect แสดงจริง** ไม่ใช่ชื่อที่คิดว่าน่าจะเป็น ตัวพิมพ์เล็ก/ใหญ่มีผล Class ที่ไม่ map จะได้ `None`

รองรับอักษรท่านิ่ง 24 ตัว: A–I, K–Y ระบบไม่รับ J/Z เพราะต้องใช้การเคลื่อนไหว ตัวอย่างชุดด่านเริ่มต้นคือ A/B/C/L/Y หากโมเดลมีอักษรชุดอื่น ให้เจ้าของห้องเปลี่ยนชุดอักษรก่อนเริ่ม แต่ต้องมีอย่างน้อย 5 ตัว

ค่า config สำคัญ:

| ค่า | ค่าเริ่มต้น | ความหมาย |
|---|---|---|
| `model_path` | `models/asl-best.pt` | path สัมพันธ์กับไฟล์ config |
| `input_mode` | `full-frame` | ส่งภาพเต็ม หรือเปลี่ยนเป็น `hand-crop` ถ้าฝึกจากภาพมือ crop |
| `image_size` | `640` | ขนาดที่ Ultralytics ใช้ ต้องหารด้วย 32 ลงตัว |
| `confidence` | `0.75` | ต่ำกว่านี้ตอบ None; config อนุญาต 0.7–1 |
| `iou` | `0.45` | ค่า NMS สำหรับ object detection |
| `association_overlap` | `0.25` | สัดส่วนกล่อง detection ที่ต้องทับกับกรอบมือ |
| `device` | `cpu` | อุปกรณ์ประมวลผล |

ถ้าใช้ classifier ที่ฝึกเฉพาะ crop มือ แต่ส่งภาพเต็มที่มีหน้าและห้อง ผลจะไม่ตรงกับข้อมูลฝึก ควรแก้ input_mode ให้ตรงก่อนลด confidence

## 5. เปิด API

Windows:

```powershell
$env:ALLOWED_ORIGINS="http://localhost:8787,http://127.0.0.1:8787"
.\.venv\Scripts\python.exe -m uvicorn asl_app:app --host 127.0.0.1 --port 8001 --workers 1
```

macOS / Linux:

```sh
export ALLOWED_ORIGINS="http://localhost:8787,http://127.0.0.1:8787"
.venv/bin/python -m uvicorn asl_app:app --host 127.0.0.1 --port 8001 --workers 1
```

เปิด `http://127.0.0.1:8001/health` ควรเห็น `protocol: "asl-alphabet-v1"`, `ready: true`, `letters` อย่างน้อย 5 ตัว และ `model_id` เป็น hash 64 ตัว

ถ้าไม่มี weights API จะตอบ 503 พร้อมข้อความ ไม่ดาวน์โหลดโมเดลอื่นมาสวมแทน ไม่สร้างผล ASL ปลอม และไม่ปล่อยให้กดพร้อมในโหมด AI

ต้องใช้ `asl_app:app` สำหรับ ASL ส่วน `app:app` เป็น API ท่าคาถารุ่นเดิม หน้าเว็บใหม่จะปฏิเสธ protocol ของ API เดิม

## 6. เชื่อมในหน้าเว็บ

1. เปิดเว็บตาม README แล้วไป `/lab` หรือ `/play`
2. เปิด “เชื่อมโมเดลของทีม” ใต้กล้อง
3. ใส่ `http://127.0.0.1:8001` ถ้าเว็บและ API เปิดในเครื่องเดียวกัน
4. กด “ใช้การเชื่อมต่อนี้” แล้ว “เชื่อมโมเดลและเปิดกล้อง”
5. อนุญาตกล้อง ยกมือข้างเดียวให้อยู่ในภาพ ทำอักษรค้างไว้จนขึ้น “พร้อมยืนยัน”
6. ในห้องเกม ทั้ง Iwazaru และ Mizaru ต้องเชื่อมโมเดลรองรับชุดอักษรเดียวกัน แล้วกดพร้อม

ภาพ preview กลับซ้ายขวาให้เหมือนกระจก แต่ภาพที่ส่ง API ไม่กลับด้าน อย่าแก้ dataset โดยอ้างอิงเฉพาะภาพ preview ถ้าโมเดลไม่แม่นให้ตรวจภาพ input และชนิดข้อมูลฝึกจริง

โมเดล fingerprint มาจาก weights, class mapping และค่าประมวลผลที่เกี่ยวข้อง ถ้าเปลี่ยน weights/config ระหว่างรอบ ให้กลับล็อบบี เปิด API ใหม่ และให้ทั้งคู่เชื่อมใหม่

## 7. ให้เพื่อนคนละเครื่องใช้ API

`127.0.0.1` บนเครื่องเพื่อนหมายถึงเครื่องเพื่อน ไม่ใช่เครื่องคุณ แนวทางสำหรับเล่นออนไลน์คือ:

- เว็บอยู่ที่ HTTPS URL เดียวกัน เช่น Worker ที่คุณ deploy
- Python API อยู่บน PC, Raspberry Pi หรือเซิร์ฟเวอร์ที่ผู้เล่นเข้าถึงได้ผ่าน **HTTPS** และยังเปิดอยู่
- Iwazaru/Mizaru ตั้ง URL ของ API เดียวกัน หรือ instance ที่ใช้ weights/config เดียวกัน
- ตั้ง `ALLOWED_ORIGINS` บน Python ให้ตรง origin ของเว็บ ไม่มี path หรือ `/` ท้ายชื่อ เช่น `https://ชื่อเว็บ.workers.dev`
- เว็บนี้ปฏิเสธ HTTP API เมื่อหน้าเว็บเป็น HTTPS เพื่อไม่ใช้ mixed content ถ้าจะเปิด API ผ่าน reverse proxy/tunnel ต้องชี้ไป Python service จริง
- ใช้ `--host 0.0.0.0` เฉพาะกรณีต้องรับผ่านเครือข่าย และตั้ง proxy/firewall ตามสภาพแวดล้อมของคุณ

Worker ในชุดนี้ไม่ได้รัน Ultralytics/PyTorch `.pt` และการอัปโหลดโมเดลไป R2 อย่างเดียวจะไม่ทำให้ inference ทำงาน

สำหรับ API ที่เปิดให้คนอื่นเข้าถึง ตั้ง `AI_API_TOKEN` ใน environment ก่อนเปิด Python แล้วกรอก token เดียวกันใน UI ของผู้เล่น ตัวอย่าง PowerShell: `$env:AI_API_TOKEN="ค่าลับของทีมที่คุณตั้งเอง"` ใช้เป็นสิทธิ์สำหรับผู้เล่นกลุ่มทดลอง ไม่ใช่ token ลับที่ซ่อนจาก browser ผู้เล่นที่ได้รับ token สามารถเห็นและนำไปเรียก API ได้ จึงไม่ควรใช้ production admin key

Token ใน UI เก็บในหน่วยความจำของหน้านั้น ไม่ฝังใน source หรือ localStorage ส่วน URL API จำใน localStorage

## 8. ภายในระบบตรวจมือ

1. Browser เปิดกล้องเมื่อผู้เล่นกดปุ่ม ไม่เปิดอัตโนมัติเมื่อเข้าเว็บ
2. MediaPipe หาตำแหน่งมือ ถ้าไม่พบมือหรือเห็นสองมือ จะล้างอักษรค้าง
3. ตัดภาพตาม input_mode ลดขนาดด้านยาวไม่เกิน 640px แล้วส่ง JPEG
4. ส่งทีละคำขอ ไม่ต่อคิวภาพเก่า API ที่กำลังตรวจอีกคนจะให้ลองภาพใหม่
5. Python รับ JPEG/PNG ไม่เกิน 1 MB ตรวจรูปภาพและกรอบมือ แล้วเรียกโมเดล
6. Object detection เลือกเฉพาะกล่องสัมพันธ์กับมือ; classification ใช้ผล class ของภาพ
7. ผล confidence ต่ำหรือไม่รู้จัก class กลายเป็น None และทำให้ต้องถือท่าใหม่
8. Browser ต้องได้ผลอักษรเดิมอย่างน้อย 3 ครั้งและต่อเนื่องอย่างน้อย 900ms ผลตอนยืนยันต้องไม่เก่าเกิน 1,500ms
9. ผู้เล่นกดยืนยันเอง ระบบไม่ส่งคำตอบอัตโนมัติ ความนิ่งถูกล้างหลังส่งและหลังเปลี่ยนด่าน
10. Worker ตรวจบทบาท โหมด fingerprint ความสดที่ client รายงาน และ challenge ของด่าน ก่อนยอมรับ

ข้อมูลภาพไม่ผ่าน D1/R2 และ Python code ที่ให้ไม่เขียนภาพลง disk หากคุณใช้ API ของคนอื่น การจัดเก็บที่ฝั่งนั้นอยู่นอกการควบคุมของเว็บนี้

## 9. เก็บผล 10 ครั้งเพื่อรายงาน

หน้า `/lab` ให้เลือกอักษรที่ตั้งใจ ทำท่า รอผลนิ่ง แล้วบันทึก ผลที่ได้มี expected, detected, confidence และ correct ดาวน์โหลด CSV ได้

- กำหนดอักษรล่วงหน้าและเก็บทั้งผลตรง/ต่าง อย่าเลือกบันทึกเฉพาะครั้งที่โมเดลตอบถูก
- เอามือลงและทำท่าใหม่ระหว่างครั้ง ไม่ใช้ภาพเดียวซ้ำ
- ทดสอบกับคนและฉากที่ไม่อยู่ในชุดฝึก รวมหลายสภาพแสง ระยะ และมือซ้าย/ขวาตามขอบเขตที่ตั้งใจรองรับ
- “ตรง 8/10” คือผลของการทดลองชุดนั้น ไม่ใช่หลักฐานว่าแม่น 80% กับผู้ใช้ทั้งหมด
- ผลชนะเกม 5 ด่านไม่ใช่ผลทดสอบ accuracy เพราะผู้เล่นสามารถลองใหม่ได้
- J/Z ต้องต่อยอดเป็นโมเดล/ตรรกะตามลำดับเวลา ไม่ควรเพิ่มใน config ของโมเดลภาพนิ่งแล้วอ้างว่าตรวจได้ครบ

## 10. แก้ปัญหา

| อาการ | จุดที่ตรวจ |
|---|---|
| `/health` 503 | path weights, Python/Ultralytics รุ่นที่ใช้ฝึก, task ที่รองรับ |
| ready false | mapping มีอย่างน้อย 5 อักษรจริงใน classes หรือไม่ |
| ขึ้น “API ไม่ใช่ ASL” | เปิด `asl_app:app` ไม่ใช่ `app:app` |
| กล้องไม่ได้ | HTTPS/localhost และสิทธิ์กล้องของ browser |
| Failed to fetch | API เปิดอยู่ไหม, HTTPS, ALLOWED_ORIGINS, URL ที่เครื่องเพื่อนเข้าถึงได้ |
| 401 | AI_API_TOKEN กับค่าในหน้าเว็บไม่ตรง |
| ตรวจได้แต่ไม่ขึ้นอักษร | confidence, unknown class, bbox ทับกรอบมือ, input_mode |
| รอแล้วไม่นิ่ง | API ช้าเกิน 1.5 วินาที, หลายมือ, แสง/กล้องสั่น, อักษรสลับไปมา |
| โมเดลสองคนไม่ตรง | weights หรือ config ต่างกัน เปิดใหม่และเชื่อมใหม่ทั้งคู่ |
| หน้าห้อง 503 | DB migration/binding ของ Worker ไม่เกี่ยวกับ Python model |

แหล่งอ้างอิง: [Ultralytics Predict](https://docs.ultralytics.com/modes/predict/), [NIDCD ASL](https://www.nidcd.nih.gov/health/american-sign-language), [ASL University Fingerspelling](https://www.lifeprint.com/asl101/pages-layout/fingerspelling.htm)
