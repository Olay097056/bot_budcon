# A2-3 — 24h stability probe (วัด ≥95% จริง)

**Type**: task
**Status**: doing — initial run DONE (blocked cooling) 2026-09-02 15:33
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

**Progress 2026-09-02 15:33**: initial `--once` รันแล้ว — `concert 100% (2/2) แต่ zones 0% (0/6) 403 Access Denied` + `discover 12 events แต่ zones 0/12` — IP booking ตก hard deny หลัง baseline 3480/h (ดู `reports/A2-3-24h-probe-initial.md`) → ต้อง cooling 30m แล้ว refresh jar ก่อนรัน 24h จริง (`scripts/a2-3-24h-probe.ts --duration 24h`)
