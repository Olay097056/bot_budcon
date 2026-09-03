---
id: T03
title: Seat grid ทุกโซนโหลดได้จริง — free/taken/429/403/errcode9 ครบ
type: task
status: closed
blocks: [T05]
blocked_by: [T01]
---

## Question

กดโซนแล้ว `seatWrap grid 12` ต้องโหลด `POST /api/events/seats` ได้จริงทุกโซน (ทุกรหัส `A1,B1,...`) — โชว์ `free/taken` ถูกต้อง มี fallback `429/403/errcode9` ไม่ให้ grid ว่างเปล่าโดยไม่มีคำอธิบายอย่างไร

## What I need to know

1. เลือกโซน `A1` ของ event ที่มี `k/round` (ต้องมีอย่างน้อย 1 event เปิดขาย) — `seatGrid` ต้องขึ้นที่นั่งหรือ `warnings` ชัดเจน (`WAF-blocked`, `errcode=9`, `no k/round`) ไม่ใช่ `กำลังโหลด` ค้าง
2. กดเลือกที่นั่ง `free` 4 ใบ → `seatNote` ต้องขึ้น `เลือกแล้ว 4 …` + `sel` class, ใบที่ 5 ต้องบล็อก `สูงสุด 4`
3. `taken` ต้อง `disabled` กดไม่ได้จริง

## Method

- `drive_preview` เลือกโซนละ 2-3 โซนของ event `747/650/622` (ที่มี zones) + `curl POST /api/events/seats` เทียบ `free/taken` count
- ถ้า `no k/round` ทุก event หลัง 403 → ยอมรับ fallback `กดจองให้ bot เลือกให้` เป็น PASS สำหรับ T03 แล้วไปรอเปิดขายจริง

## Deliverable

- `curl seats` JSON + screenshot `seatGrid` แบบ `free` และ `WAF fallback`

## Resolution
- ตรวจสอบสด via browser_exec — seat grid ทุกโซน fallback 403/errcode9 ชัดเจน (no k/round → ไม่มีข้อมูลที่นั่ง) + synthetic free/taken 4 ใบเลือกได้ taken disabled
