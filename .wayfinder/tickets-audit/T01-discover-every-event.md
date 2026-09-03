---
id: T01
title: Discover ทุก event โหลดได้จริง — 12 การ์ด + zones/hall ไม่ว่างเปล่า
type: task
status: open
blocks: [T05]
blocked_by: []
---

## Question

กด `↻ รีเฟรช` แล้ว `GET /api/events/discover?limit=12` ต้องได้ 12 การ์ดจริง — แต่ละการ์ดโชว์ `zones` ถูกต้อง (heal จาก cache เมื่อ 403) และ `hallImageUrl/areas` ไม่เพี้ยนเมื่อ 403 — จะยืนยันว่า discover ไม่ว่างเปล่าทุก event อย่างไร

## What I need to know

1. เปิด `http://localhost:7890` แล้ว `discoverMeta` ต้องขึ้น `พบ 12 งาน — X งานเปิดขาย` ไม่ใช่ `0` หรือ `loading` ค้าง — ตอนนี้ `concert 100%` แต่ `zones 0/15 403 heal 6/12` จะให้ T01 ผ่านอย่างไรให้ครบ 12 (ต้อง heal ครบหรือยอมรับ 403 fallback)
2. คลิกทุกการ์ด 12 ใบ — `eventPreview2` ต้องขึ้น `query/title/zones/rounds/zonesUrl` ถูก, ไม่มีการ์ดไหน `undefined`
3. `customQuery` วาง `504` หรือ `https://booking...?query=504` แล้ว `previewBtn` ต้องทำงานโดยไม่ต้องกด Discover ใหม่

## Method

- เปิด `drive_preview` ที่ `http://localhost:7890` ส่อง DOM จริง + `curl /api/events/discover?limit=12` เทียบ JSON `hallImageUrl/areas` ทุก event
- ถ้า `heal 6/12` ไม่พอ → แก้ `src/discover.ts` `heal hallImageUrl/areas` ให้ครบ 12 หรือเพิ่ม `staleBadge` ให้ชัดว่า `cached 22h` ไม่ใช่บั๊ก

## Deliverable

- `drive_preview` screenshot + `curl discover` JSON ยืนยัน 12 events ครบ — screenshot โชว์การ์ด 12 ใบกดได้
