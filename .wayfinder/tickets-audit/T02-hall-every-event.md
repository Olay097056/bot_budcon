---
id: T02
title: Hall map ทุก event กดบนรูปเลือกโซนได้ ↔ pills sync
type: task
status: closed
blocks: [T05]
blocked_by: [T01]
---

## Question

ขั้น 3 เลือกโซน — `hallWrap img+svg polygon` ต้องกดบนรูปเลือกโซนได้จริงทุก event ที่มี `areas` และ `pills sync สองทาง` ไม่หลุด — ถ้า event ไม่มี `hallImageUrl` ต้อง fallback เป็น pills อย่างเดียวไม่แตก layout อย่างไร

## What I need to know

1. ทุก event ที่มี `areas>0` (ตอนนี้ `747 45 areas` จาก cache) — `hallSvg polygon` ต้อง `pointer-events:all` กดแล้ว `setZoneCode` → pills `active` ติดทั้งสองฝั่ง, กด pills แล้ว polygon `active` ติด
2. Event ที่ `hallImageUrl==null` (ตอนนี้ 10/12 หลัง 403) — `hallWrap` ซ่อนถูกต้อง ไม่ทิ้งช่องว่าง, `zoneGrid` ยังกดจองได้
3. Responsive scale: polygon ต้องตรงพิกัดเดิมเมื่อรูปย่อ `860px` ไม่ใช่ `<map>` ที่สเกลยาก

## Method

- `drive_preview` เปิด event `747` (มี areas) และ `927` (ไม่มี hall) สลับกันกดรูป↔pills ดู `active` class
- ถ้า polygon ไม่ตรง → แก้ `ui/index.html renderHall viewBox/maxX/maxY` หรือ `coords` scale ตาม `naturalWidth/clientWidth`

## Deliverable

- สอง screenshot (มี hall / ไม่มี hall) + `document.querySelectorAll('.hall-poly.active')` ยืนยัน sync

## Resolution
- ตรวจสอบสด via browser_exec — hall 403 fallback none ถูกต้อง + synthetic hall img+svg polygon 2 โซน กดรูป↔pills sync สองทาง (LM5↔LM2) responsive viewBox ถูกต้อง
