# A2-3 — 24h stability probe (วัด ≥95% จริง)

**Type**: task
**Status**: open
**Label**: `wayfinder:task`
**Depends**: 01 (curl-booking ผลลัพธ์), 02 (ip-hygiene กำหนด rate)

## Question

เมื่อ 01+02 ให้ transport ที่เหมาะสม + rate ที่ปลอดภัยแล้ว — สร้าง probe script รัน 24 ชม. ต่อเนื่อง:

- ทุก 10 นาที: curl concert/ (นับ status+bytes+queries)
- ทุก 15 นาที: curl zones.php ด้วย auth jar (3 queries ตัวอย่าง)
- ทุก 30 นาที: curl fixed.php 1 จุด (ถ้า 01 ยืนยันว่าผ่าน)
- เก็บ JSONL: timestamp, endpoint, status, bytes, latency
- ห้ามรบกวน watch/book จริง (แค่ GET วัด)
- รายงานปลายทาง: pass % ต่อ endpoint, deny pattern (ช่วงเวลาไหน deny เยอะ)

**Verify (Destination)**: pass ≥95% ทุก endpoint ตลอด 24 ชม. → map ปิดได้
