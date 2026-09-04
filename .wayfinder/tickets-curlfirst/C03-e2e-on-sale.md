---
id: C03
title: E2E จองจริงด้วย curl-first บน event ที่เปิดขาย
type: task
status: doing — blocked on WAF cooling + on-sale window
blocks: []
blocked_by: [C01, C02]
---

## Question

flow ครบ: UI กดจอง → curl เลือกโซน+ที่นั่ง → validateseat → hand-off Firefox หน้า payment → คนจ่ายเงินสำเร็จ — ทดสอบบน event เปิดขายจริง (เช่น 741 รอบ 82047 หรือ event วัน D) ผ่านไหม?

## Progress 2026-09-04 (ลุยจริง)

**โค้ดครบแล้ว** `f1bd33d`:
- `curlBook()` (sync curl) + `curlBookWithFetcher()` (hardenedFetcher) — dual fallback ใน `book()`
- Firefox `selectZone` fail → curlBook → hardenedFetcher → sync cookies → paymentall.php → humanStep

**ผลทดสอบสด 741 โก๋หลังวัง + 504/747/597/612:**
- login สดแล้ว curlBook ยิงผ่าน WAF ได้ช่วงหนึ่ง (200) — เจอ `no k/round` = event ยังไม่เปิดขายจริง
- ต่อมา WAF แกว่งกลับ 403 Access Denied (jar score ตกจากยิงรัวทั้งวัน) — สลับ 403↔200 ทุก 1-2 นาที

**สรุปอุปสรรค (ไม่ใช่บั๊กโค้ด):**
1. **WAF cooling** — IP score ตกจาก probe/ทดสอบรัว ต้องพัก (ชั่วโมง–ข้ามคืน)
2. **On-sale window** — ทุก event ใน cache ยังไม่เปิดขาย (`no k/round` เป็นสถานะจริง)

**ขั้นต่อไปเมื่อทั้งสองคลาย:** login สด → ยิง `POST /api/book/start` event ที่เปิดขาย → คาดหวัง flow ผ่านถึง humanStep payment
