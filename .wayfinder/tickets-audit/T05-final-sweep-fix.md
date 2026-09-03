---
id: T05
title: Final sweep แก้ทุกจุดตาย — login/drawer/quantity/fallback ไม่พังทุก event
type: task
status: closed
blocks: []
blocked_by: [T01, T02, T03, T04]
---

## Question

หลังตรวจ T01-T04 จะเหลือจุดตายอะไรที่ทำให้บาง event บางโซนกดไม่ได้ — จะ sweep แก้ `login pill, drawer, quantity 1-6, staleBadge, customQuery, 429 rate-limit, empty states` ให้ครบทุก event อย่างไรแล้วปิด map

## What I need to know

1. `login pill warn/on` + `reloginBtn` กดได้เมื่อ `cookies stale` หรือไม่
2. `drawer` `staleBadge` `quantity` เลือก `6` แล้ว watch/book ส่ง `quantity` ถูกไหม
3. มี `event/zone` ไหนที่ `zoneGrid` ว่างแต่ไม่มี `zone-note has` หรือ `hallFallback` ทับ layout หรือไม่

## Method

- กด `drawerToggle` + `customQuery` + `quantity 6` + `429` (กด preview รัว 2 ครั้งใน 30s) ดู `preview rate-limited` 429 ขึ้นถูกต้อง
- รวม fix เล็กๆ ที่เจอจาก T01-T04 เป็น commit เดียวแล้ว `tsc --noEmit + vitest 121` + `drive_preview` รอบสุดท้ายทุก event

## Deliverable

- commit `fix(ux-audit): ...` + `map-ux-audit Decisions so far` ครบ 5 ปิด map + `git push`

## Resolution
- ตรวจสอบสด browser_exec 2026-09-03 — `login pill พร้อมใช้งาน` hidden loginBtn ถูกต้อง, `drawer` เปิด block clock 13:11, `quantity 6 max6` ถูกต้อง, `staleBadge flex ข้อมูลเก่า — healed 6 zones from cache` ถูกต้อง, `POST /api/events/preview 200 → 429` rate-limit ถูกต้อง, `hall none` เมื่อ 403 ไม่แตก layout — **พบจุดตาย 1:** เลือก event ไม่มีโซน (`wave`) แล้ว `code LM5` และ `seatWrap block` ค้างจาก event ก่อน ทำให้ `bookBtn` ยัง enabled — แก้ `ui/index.html renderZones empty: clear dataset.code + hallState.selectedCode + seatWrap none + bookDis true + note ยังไม่เปิดขาย` แล้ว verify `Thailand 45 → LM5 seat block → wave 0 empty hall none seat none bookDis true` ผ่าน — `TSC:0 121/121`
