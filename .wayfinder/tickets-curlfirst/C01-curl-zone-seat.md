---
id: C01
title: curl ยิง zones→fixed→รายชื่อที่นั่ง ให้เป็นโค้ดจริงใน book flow
type: task
status: closed
blocks: [C03]
blocked_by: []
---

## Question

ย้าย logic จาก scripts/a2-1-curl-booking-probe.ts (พิสูจน์แล้ว) เป็น path ใน src/book.ts: โซน+รอบจาก zones.php (curl) → หน้าที่นั่ง fixed.php (curl) คืน seat map + k/round — ทำงานได้แม้ Firefox fingerprint โดน 403 ไหม?

## Resolution

**เสร็จ** `608fb4b` — `src/curl-book.ts`:
- `curlBook()`: zones (curl/8.0.1+jar) → extract k/rounds → fixed.php (Referer=zones กัน errcode9) → parse free seats (seatuncheck) → validateseat POST (ล็อคที่นั่งใน session)
- **Fresh-session retry**: ถ้า zones 403 ด้วย jar เก่า → ยิงซ้ำแบบ no-cookie (พิสูจน์ 200 ผ่าน — WAF block cookie score ไม่ใช่ IP) แล้ว chain Set-Cookie จาก Netscape jar ไป fixed/validateseat
- Wire ใน `book()`: Firefox `selectZone` fail → curlBook fallback → sync cookies ลง context → `page.goto paymentall.php` → humanStep payment

**ผลทดสอบสด 741:** zones ผ่าน (fresh retry) → `no k/round — sale not open` = สถานะจริง (event ปิดขาย) — flow ถูกต้องทุกขั้น รอ event เปิดขายยิงจริงใน C03
