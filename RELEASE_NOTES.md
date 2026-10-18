# ASL performance and camera distance (2026-10-18)

- Export a fixed 384 input model from the original checkpoint and retain the 640 profile.
- Add padded hand crop, mirror, 720p camera capture and confidence 0.50 matching the Python webcam threshold.
- Enable isolated WASM threads with SSR/static/dev headers and show per-stage timing, actual thread count and GPU fallback details.
- Validate checkpoint/browser parity and preserve the deployed Worker URL fix. See PERFORMANCE-ASL-TH.md for measured results and limits.
- Include both inference models in the GitHub source; keep training data, environments and account secrets local.

---

# SANZARU — ONNX Runtime Web พร้อมโมเดลของทีม

แปลง checkpoint YOLO26n best.pt ของทีมเป็น ONNX float32 ขนาด 9.39 MiB และเชื่อมกับหน้า /play และ /lab แล้ว ประมวลผลภาพบนเครื่องผู้เล่นผ่าน dedicated Worker ใช้ WebGPU เมื่อรองรับและ WASM เป็นทางสำรอง ไม่ต้องเปิด Python API

- รองรับ A–Z ตาม class จริง ส่วน nothing ไม่ส่งคำตอบ; J/Z ยังเป็น class จากภาพ ไม่ตรวจการเคลื่อนไหว
- ตรวจ hash ของโมเดลและ runtime พร้อมตรวจ fingerprint ของผู้เล่นทั้งสองบทบาท
- รวม runtime JS/WASM ในเว็บ แบ่ง WASM เป็นชิ้นขนาดไม่เกิน 20 MiB สำหรับ Cloudflare
- แปลงและทดสอบด้วยโมเดลจริง: checkpoint/ONNX 54/54, browser parity 54/54 ต่อโหมด, JPEG 27/27 ต่อโหมด
- ระบบห้องสามคน/ห้าด่านและสิทธิ์เสียงผ่าน built Worker กับ local D1/R2
- เพิ่ม check:deploy, รายงานโมเดล และ ZIP build สำเร็จสำหรับ deploy

อ่าน MODEL-REPORT-TH.md สำหรับผลจำแนกและ latency ซึ่งไม่เท่ากับความแม่นยำ 100% รายละเอียดการทดสอบอยู่ใน TESTING.md

ต้องกำหนด D1/R2 ของบัญชีจริงและ apply migrations ก่อน deploy ยังไม่ได้เผยแพร่ออนไลน์ และยังไม่ได้ทดสอบกล้อง/ไมค์จริงหรือ WebGPU ที่ทำงานสำเร็จ คู่มือ Python API เก่าอยู่ใน docs/archive/
