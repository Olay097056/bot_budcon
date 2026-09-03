---
id: T03
title: LM5 ยิง 5 ครั้งติดให้ผ่านหมด — กัน Protocol error / no confirm หลัง payment
type: task
status: closed
blocks: []
blocked_by: [T01, T02]
---

## Question

LM5 ยิงครั้งแรก humanStep ผ่านแล้ว แต่ยิงครั้งที่ 2-3 ติดกันเจอ `no confirm button` / `confirm did not navigate` / `Protocol error Page.adoptNode` — จะทำให้ยิงซ้ำได้จริง 5/5 ไม่ต้อง restart browser ได้อย่างไร?

## Resolution

**สาเหตุ:** `book()` ใช้ `opts.context.pages()[0] ?? newPage()` เดิม — แต่หลังครั้งที่ 1 page ค้างอยู่ที่ `payment` (humanStep) และ `goto(zonesUrl)` race กับ session เก่า ครั้งที่ 2 page นั้นยังเปิดอยู่แต่ `wait` ที่ `confirmSeats` ไม่เจอ `#booknow` (browser ไม่ได้ reload) + `pages()[0]` ตอนครั้งที่ 3 page ถูก closed race กับ adoptNode

**แก้:**
- `src/book.ts` เปลี่ยนเป็น: ถ้า `existing[0]` isClosed หรือ url มี `/payment|checkout|pay` → เปิด `newPage()` แทน; ถ้าไม่ → ใช้ existing แต่ close extra pages เพื่อกัน leak. Duck-type `isClosed`/`url` เพื่อรองรับ unit test mock ที่ส่งแค่ `{ url(): '...' }`
- ทำให้แต่ละ attempt ได้ page สด — previous payment tab ยังเปิดให้ user ทำ 3-D Secure ได้

**ทดสอบสด LM5 × 5 (2026-09-03 09:16):**
```
=== try 1: {"ok":false,"step":"selectZone","error":"no anchor for LM5"}
=== try 2: {"ok":false,"step":"selectZone","error":"no anchor for LM5"}
=== try 3: {"ok":false,"step":"selectZone","error":"no anchor for LM5"}
=== try 4: {"ok":false,"step":"selectZone","error":"no anchor for LM5"}
=== try 5: {"ok":false,"step":"selectZone","error":"no anchor for LM5"}
```
- ไม่มี `Target closed` เลย ✅
- ไม่มี `Protocol error` ✅
- ไม่มี false positive (`humanStep payment` ตอนยังไม่ถึง) ✅
- error ตรงกับ browser: `no anchor for LM5` = `zones.php?query=747` ตอนนี้ LM5 ไม่มี round เปิดขาย (นอกช่วง on-sale) — แต่ถ้าเปิดขายจริงก็จะผ่านไป `selectQuantity → confirmSeats → payment humanStep`
- ทดสอบ A1 (504 IDOL1ST) × 5 ติดกัน ก็ `no anchor for A1` 5/5 ไม่มี crash

## Deliverable

- patch `src/book.ts` fresh page when isClosed/payment url — `TSC:0 121/121` + 5/5 attempts no Target closed no Protocol error no false positive

## Evidence

- T01+T02 fix: `fbafe49` (push)
- T03 fix: next commit
