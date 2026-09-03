---
id: T02
title: กดจองแล้ว Timeout 30s — กำจัด elementHandle.click race ให้ไม่ fail อีก
type: task
status: closed
blocks: []
blocked_by: []
---

## Question

ทำไม `confirmSeats` (และ `pickSeats`) `elementHandle.click: Timeout 30000ms exceeded` ทั้งที่ `force:true` แล้ว และจะแก้ให้ไม่ timeout 100% ได้อย่างไร?

## Resolution

**สาเหตุ:** Playwright `elementHandle.click({force:true})` ยังทำ actionability checks (scroll into view, hit testing) ซึ่ง hang ที่ `performing click action` เมื่อปุ่มถูก overlay `div.seat` / detached จาก navigation ทันทีที่ click เริ่ม — timeout 30s เต็ม

**วิธีแก้ (src/book.ts):**
- `confirmSeats`: เปลี่ยนจาก `btn.click({force:true})` เป็น `page.$eval` / `handle.evaluate(el=>el.click())` ซึ่ง bypass actionability ทั้งหมด — ไม่ scroll, ไม่ wait, click ทันที
- เก็บ `matchedSel` ไว้ `$eval` ตรง selector, fallback `btn.evaluate` → `btn.click({force:true, timeout:5000})` สำหรับ mock/tests
- catch `Timeout`/`not attached`/`detached`/`Target closed` แล้วเช็ค `page.url() !== beforeUrl` ถือว่าสำเร็จถ้า navigation เริ่มแล้ว (race ที่เคย fail กลายเป็น pass)
- ลด `waitForLoadState 10s→5s`, `waitForTimeout 800→400` — ไม่ต้องรอ navigation เต็ม
- `pickSeats`: ทำเช่นเดียวกัน — `handle.evaluate` ก่อน, fallback `click timeout 3000`, `evaluate` via `page.evaluate` — ลด `600→250`, `1000→500`, `1500→800`

**ทดสอบ:** `npx vitest 14 passed 121 passed` TSC:0 + browser ทดสอบ 741 A ผ่าน 5/5 ครั้ง ไม่ timeout (เดิม 1/5 timeout)

## Deliverable

- patch `src/book.ts` confirmSeats+pickSeats — `git diff src/book.ts` ดูได้
