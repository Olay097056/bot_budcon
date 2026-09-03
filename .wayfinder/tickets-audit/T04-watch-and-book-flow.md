---
id: T04
title: Watch + Book flow กดได้จริงทุก event — autoBook → payment → finalize
type: task
status: open
blocks: [T05]
blocked_by: [T01]
---

## Question

`Watch เริ่มเฝ้า → เจอโซนใหม่ → autoBook/human Book → payBar → finalize` ต้องกดได้จริงทุก event โดยไม่ต้องพึ่ง `customQuery` และไม่พังเมื่อ `watch 403 degraded/circuit` อย่างไร

## What I need to know

1. เลือก event 12 ใบแล้วกด `▶ เริ่มเฝ้ารอ` ทุก event — `POST /api/watch/start` ต้อง `202` ไม่ใช่ `401` (loggedIn true) หรือ `409` ค้าง, `watchStatus` ต้องเปลี่ยน `กำลังเฝ้า`
2. `autoBook` switch เปิด/ปิดแล้ว `POST /api/watch/start {autoBook, quantity}` ส่งค่าถูก, `stopBtn` หยุดได้
3. `Book Now` เมื่อมี `lastEvent` หรือ `codeTyped` ต้อง `POST /api/book/start` ได้ — ถ้าติด `no confirm button` ต้องโชว์ error ภาษาคน ไม่ใช่ `500`

## Method

- `drive_preview` กด Watch→Stop 2 รอบ + `Book` แบบ `codeTyped` (ไม่รอ lastEvent) เช็ค `bookNote` และ `payBar` (mock `humanStep` โดยตรวจ `book/start` response ว่ามี `humanStep` หรือ `error` ชัดเจน)
- ถ้า `Watch` ติด `circuit open` หลัง 403 → ยืนยัน `degraded/circuit` pill โชว์ถูกต้องเป็น PASS

## Deliverable

- `watch/status` + `book/start` response logs + screenshot `hitBanner/payBar`
