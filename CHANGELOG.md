# ASL performance and camera distance (2026-10-18)

- Export a fixed 384 input model from the original checkpoint and retain the 640 profile.
- Add padded hand crop, mirror, 720p camera capture and confidence 0.50 matching the Python webcam threshold.
- Enable isolated WASM threads with SSR/static/dev headers and show per-stage timing, actual thread count and GPU fallback details.
- Validate checkpoint/browser parity and preserve the deployed Worker URL fix. See PERFORMANCE-ASL-TH.md for measured results and limits.
- Include both inference models in the GitHub source; keep training data, environments and account secrets local.

---

# Fix deployed browser Worker URL (2026-10-18)

- Use Vite's ?worker&url import so Vinext's import.meta.url rewrite cannot create a file:/// Worker URL.
- Check the emitted client constructor at deployment preflight, including a regression case that fails on the previous bundle.
- Verify the actual /lab and /play buttons with production JS and real model warm-up, without opening the physical camera.
- Require a matching production-page validation report when packaging the corrected release.

---

# Team model and deployment bundle (2026-10-18)

- Export the supplied YOLO26n best.pt using Ultralytics 8.4.181 to fixed FP32 ONNX [1,3,640,640] → [1,300,6].
- Include A–Z mapping and ignore the nothing class; preserve the original checkpoint.
- Verify checkpoint/ONNX parity on 54 test images, production browser parity on the same images, and original JPEG decoding on 27 images per provider mode.
- Verify the built Worker with local D1/R2 through five ASL rounds and voice access checks.
- Add deploy preflight, a checked prebuilt ZIP with hashes, and Thai model/deployment reports. No cloud deployment has been performed.

---

# ONNX Runtime Web update (2026-10-18)

- Run ASL detection locally in a dedicated browser Worker; prefer WebGPU with WASM fallback.
- Add verified manifest/model SHA-256, actual class mapping, letterbox/RGB/NCHW and three YOLO detection output layouts.
- Preserve hand association, capture-time stability, room fingerprints and all three game roles.
- Support A–Z image classes; J/Z motion recognition is still outside this adapter.
- Add model export and runtime asset preparation, including split WASM assets for Cloudflare.
- Replace camera API/token settings with manifest/provider settings and local-processing status.
- Add ONNX unit tests, real-browser synthetic model tests, exporter helper tests and Thai documentation.
- No trained ASL weights or cloud deployment supplied. See TESTING.md for verified scope.

---

# 3.0.0 — ASL Hand to Heart (2026-10-18)

- New three-role ASL game: private answer → detected letter → voice relay → detected answer.
- Five untimed seals, custom letter pools, pause, rematch and role rotation.
- Same-model fingerprint checks, current-frame hold filtering, explicit practice mode.
- ASL FastAPI adapter, setup documentation, D1 migration and R2 voice endpoint.
- Redesigned five public pages, learning trials and access preferences.
- ASL engine/API/inference tests; Python fake-predictor contract tests.
- No real ASL weights, live deployment or accessibility certification supplied.

---

# 2.2.0 — User-owned .pt gesture model adapter

- เพิ่ม FastAPI service และ Ultralytics adapter สำหรับ detect/classify
- เพิ่มช่องใส่ URL/token และเลือก MediaPipe/custom ในหน้าเตรียมเล่นของคนร่าย
- คง MediaPipe สำหรับปลายนิ้วและ Pointing_Up โดยใช้โมเดล custom เฉพาะท่าปิดผนึก
- ตรวจ class mapping ครบ 4 ท่า, hand ROI, confidence, ความต่อเนื่อง และอายุภาพ
- ป้องกันคำขอซ้อน/ภาพเก่า/ผลตอบหลังปิดกล้อง และแจ้งการส่งภาพตามโหมดจริง
- เพิ่มคู่มือภาษาไทย การตั้งค่า Windows/macOS/Linux และ script export ONNX
- ยังไม่มี .pt ของผู้ใช้ และ ONNX browser adapter ยังไม่ถูกเชื่อม
- คงกลไกคลาสสิกเดิมระหว่างการเปลี่ยนท่า ไม่ให้การกรองใหม่ยกเลิกท่าชาร์จก่อนปล่อย

# 2.1.0 — Learning edition

- เพิ่มหน้าแรก ประวัติ/ปรัชญาพร้อมอ้างอิง ห้องทดลองความคิด และหน้าเวิร์กช็อป
- เพิ่มกิจกรรมแยกหลักฐาน 3 ข้อ และสถานการณ์ชวนคิด 3 เรื่องพร้อมบันทึกเหตุผล
- ตั้งเป้าหมายก่อนเกมและบันทึกหลังจบ เชื่อมคะแนนจากรอบจริง
- ดาวน์โหลดบันทึกและแผนกิจกรรม 20/30/45 นาที พร้อมโครง pitch 7 นาที
- ย้ายเกมไป /play รองรับลิงก์ชวนเก่า และคง /classic
- ข้อมูลเรียนรู้เก็บในเครื่อง ไม่เพิ่ม database migration หรือบริการ AI ใหม่
- ไม่มีการ deploy รุ่นนี้

# 2.0.0 — SANZARU / Three Wise Monkeys

- เปลี่ยนโหมดหลักเป็นพันธสัญญาสามวานร พร้อมภาพตัวละคร SVG ใหม่ครบสามตน
- ฉากศาลกลางป่าและเงาอคติ โทนหมึก หยก ทองเก่า
- มิซารุเป็นคนกลางที่ไม่เห็นอสูรและตำรา
- คิคาซารุร่ายเวทและรับเฉพาะข้อความ; ส่งเสียงได้แต่ฟังคลิปไม่ได้
- อิวาซารุถือตำราและตอบด้วยสัญลักษณ์ลำดับจุด/ท่ามือ พร้อมสถานะสั้นสามแบบ
- กติกาสารใหม่ตรวจทั้ง UI และ API; ตรวจข้อมูลและกรองฟิลด์ก่อนบันทึก
- เพิ่มแนวคิดในเว็บ คำถามประจำผนึก และคำถามสะท้อนคิดหลังจบรอบ
- รักษาระบบออนไลน์ 3 คน การร่ายด้วยกล้อง การใช้เมาส์ พัก/กลับมาเล่น และเล่นใหม่
- เพิ่มการทดสอบ API สำหรับสามพันธสัญญา และปรับ README/คู่มือ
- `/classic` เป็นโหมดก่อนหน้า แยกจากธีมหลัก; ไม่ได้ deploy เวอร์ชันนี้

การตรวจ: TypeScript ผ่าน, automated tests ผ่าน, production build ผ่าน
ยังไม่ได้ทดสอบ browser UI และกล้อง/ไมค์จริงในรอบแก้ไขนี้
