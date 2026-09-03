---
id: T02
title: ทำไมระบบบอกไปหน้าจ่ายเงิน แต่ browser ยังค้างหน้าจอง LM5
type: research
status: closed
blocks: []
blocked_by: []
---

## Question

ทำไม `confirmSeats` คืน `ok:true` (ระบบคิดว่าไปหน้าจ่ายเงิน) แต่ browser ยังอยู่ `fixed.php?zone=LM5` ไม่ได้ไปหน้าชำระเงินจริง

## Resolution

**สาเหตุ:** หลังแก้ 62eb3c3 `confirmSeats` ใช้ `evaluate(el.click())` + `waitForLoadState 5s catch + wait 400ms → return ok:true` ทันที โดยไม่เช็คว่า navigation เกิดจริง — ถ้า `#booknow` ยัง disabled (seat ไม่ validated, `hid-checkseat==0` สำหรับ LM5) click จะไม่ไปไหน แต่ระบบยังคืน success → UI โชว์ humanStep payment ทิพย์

**แก้:**
- `src/book.ts` `confirmSeats` หลัง wait เพิ่ม verify: `url still includes fixed.php/zones.php?query` → เช็ค `hasPayment = page.$('input[name=cardNumber], #payment, .payment-form')` และ `stillHasBookBtn = page.$('#booknow,#bookmnow').isVisible()` → ถ้า `!hasPayment && stillHasBookBtn` ให้ `return {ok:false, step:confirmSeats, error:'confirm did not navigate — button may be disabled or seats not validated (ยังอยู่หน้าเลือกที่นั่ง: '+url+')'}`
- ทำให้รายงานตรงกับ browser จริง — manual LM5 ครั้งที่ seat ไม่ valid จะได้ error ภาษาไทยชัดเจน ไม่ทิพย์ว่าเป็น payment

**ทดสอบ LM5:** `POST /api/book/start LM5` ตอน seat valid → humanStep payment ถูกต้อง, ตอน seat ไม่ valid → `confirm did not navigate` ถูกต้อง (ก่อนแก้ จะ humanStep ทั้งคู่)

## Deliverable

- patch `src/book.ts` confirmSeats verify — `vitest 121` + LM5 747 128 seats (109 free) book ครั้งแรก humanStep ผ่าน
