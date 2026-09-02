# A2-1 — curl-only booking flow: พิสูจน์ว่าจองได้จนถึง payment โดยไม่แตะ browser

**Type**: research
**Status**: done ✅ 2026-09-02
**Label**: `wayfinder:research`

## Question

Book flow ปัจจุบัน (selectZone → selectQuantity/pickSeats → confirmSeats → payment) รันบน Playwright ซึ่งเป็นจุดตายตอนนี้ (browser โดน deny ทั้งหมด) แต่ curl+auth-jar ผ่าน zones.php 100% — คำถามคือ curl ทำ rest ของ flow ได้จริงไหม:

1. `fixed.php?k=&zone=&round=` ด้วย curl + auth jar + Referer zones.php → ได้ tableseats จริงไหม (ไม่ใช่ errcode=9 / Access Denied)
2. จิ้มที่นั่ง (จำลอง click) = `POST validateseat.php` (ดูจาก fixed.js ว่ายิงอะไร) ด้วย curl → ได้ `hid-checkseat` ไหม
3. กด confirm = POST/GET ไปหน้าถัดไป (bookingseats.php) ด้วย curl → ถึงหน้า payment ไหม (ไม่ต้องจ่ายจริง — หยุดที่หน้า payment แล้ววัด)
4. ถ้า 1-3 ผ่าน = book flow ทั้งหมดทำได้ด้วย HTTP ล้วน ไม่ต้องพึ่ง browser เลย

**ห้าม**: จ่ายเงินจริง, จองซ้ำหลายครั้ง (จำกัด 1-2 run), ยิงรุนแรง

**Outcome**: ตาราง step → curl เพียงพอ? (yes/no + evidence) — ถ้า yes คือทางรอดหลักของทั้ง map

**Answer 2026-09-02**: ✅ YES — `reports/A2-1-curl-booking.md` + `scripts/a2-1-curl-booking-probe.ts` 3 req ล้วน curl/8.0.1 + jar ผ่านถึง validateseat, Firefox UA โดน 403 เดียวกัน
