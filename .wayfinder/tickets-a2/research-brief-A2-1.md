---
to: research-subagent
from: wayfinder (bot_budcon Akamai-resilience round 2)
re: A2-1 curl-only booking flow
---

## ภารกิจ

พิสูจน์ว่า book flow ของ TTM ทำได้ครบด้วย **curl + cookie jar เท่านั้น** (ไม่ใช้ Playwright/browser เลย) — จุดตายของระบบตอนนี้คือ browser โดน Akamai deny ทุก profile

## Context ที่ต้องรู้

- Repo: `C:/Users/bit-it.helpdesk/Desktop/claude/_active/bot_budcon`
- cookies.json อยู่ที่ `C:/Users/bit-it.helpdesk/.bot-budcon-data/cookies.json` (มี PHPSESSID + ttkname + Akamai cookies — auth ยังใช้ได้)
- ตอนนี้ curl + auth jar ผ่าน zones.php 100% (ตัวอย่างโค้ดอยู่ `scripts/stability-probe.ts`)
- endpoints:
  - `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=614` (มีที่นั่งว่างจริง — REMASTER CONCERT, zone A1 มี 30 ที่)
  - `fixed.php?k=<k>&zone=<Z>&round=<r>` (k+round อ่านจาก zones.php HTML: `<input name="k">`, `#rdId option`)
  - ดู `fixed.js` (โหลดจาก HTML ของ fixed.php) ว่าจิ้มที่นั่ง/ยืนยันยิง request อะไร (น่าจะ validateseat.php POST แล้วไป bookingseats.php)
- Referer สำคัญ: fixed.php ต้องมี `Referer: zones.php?rdId=...&k=...&query=...` มิฉะนั้น errcode=9
- อ่าน `.wayfinder/tickets-a2/01-curl-booking.md` ก่อนเริ่ม

## สิ่งที่ต้องหาคำตอบ

1. curl ยิง fixed.php → ได้ tableseats จริง? (200 + มี `#tableseats` + `seatuncheck` > 0)
2. จิ้มที่นั่งด้วย curl (จำลอง validateseat.php POST ตามที่ fixed.js ทำ) → ได้ response ที่มี `hid-checkseat` ไหม
3. POST/GET ต่อไปยังหน้า confirm → ถึงหน้า payment ไหม (หยุดที่นั่น — ห้ามจ่ายเงินจริง, ห้าม confirm ซ้ำเกิน 2 ครั้ง)
4. ถ้าทุก step ผ่าน = curl-only booking เป็นไปได้ → บอกด้วยว่าต้องใช้ header/cookie/Referer อะไรบ้าง

## ข้อห้าม

- ห้ามจ่ายเงิน / ยืนยันการซื้อจริงเกิน 1 ครั้ง (ทดสอบกับ query=614 zone ที่มีที่ว่าง ครั้งเดียวพอ)
- ห้ามยิงรุนแรง (ทั้งหมดไม่เกิน ~30 requests)
- ห้ามแก้โค้ดหลักใน src/ — เขียน probe script ใหม่ใน scripts/ เท่านั้น

## ส่งมอบ

รายงาน 1 ก้อน: ตาราง step → pass/fail + evidence (status, bytes, ชื่อ HTML element ที่เจอ) + คำตอบสุดท้าย "curl-only booking: ได้/ไม่ได้" พร้อมเหตุผล
