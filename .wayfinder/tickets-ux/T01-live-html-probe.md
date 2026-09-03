---
id: T01
title: Live TTM HTML probe — รูปผังฮอลล์ + coords + ตารางที่นั่ง มีอะไรให้ดึงสดบ้าง
type: research
status: closed
blocks: [T03, T04]
blocked_by: []
---

## Question

`zones.php` และ `fixed.php` ของ TTM ส่งอะไรกลับมาจริงในวันนี้ให้เราดึงสดได้บ้าง — ต้องรู้ก่อนออกแบบ UX ว่าจะมี `imageUrl`, `<area coords>`, `#tableseats` ให้ใช้จริงไหม และ fallback เมื่อ `403` จะเป็นอย่างไร

## What I need to know

1. `zones.php?query=<q>` (เช่น 504, 622, 650) เมื่อยิงด้วย `curl/8.0.1 no-cookie (www)` vs `curl+jar+Referer (booking)` vs `browser` — HTML ที่ได้ต่างกันอย่างไร, มี `<img ... usemap>` กี่รูป, `src` เป็น absolute/relative, ขนาดเท่าไหร่, `<area href="#fixed.php#CODE" coords="x,y,..." shape="poly">` มีครบทุก zone ไหม
2. `fixed.php?k=...&zone=A1&round=...` มี `#tableseats` โครงสร้างเป็นอย่างไร — `td[title="BB-08"] > div.seatuncheck/seatnotavail` กี่แถวคอลัมน์, มี `k`/`round` hidden input อะไรบ้าง
3. เมื่อ `403 418B` (booking hard deny ตอนนี้) — body เป็นอย่างไร, มี image ให้ heal จาก `discover-cache.json` ได้ไหม
4. Venue ที่ไม่มี `<img>` แต่เป็น `canvas/svg` มีจริงไหม — ต้อง handle พิเศษไหม

## Method

- ใช้ `src/ttm-fetch.ts` `hardenedFetcher` + `src/ttm-curl.ts` `curlTransportSync` + auth jar จาก `C:/Users/bit-it.helpdesk/.bot-budcon-data/cookies.json` ยิง `concert/` 1 ครั้ง + `zones.php` 3 queries + `fixed.php` 1 โซน (ถ้า T01 ยิงได้) — เก็บ HTML ลง `.wayfinder/references/T01-html-*.html` อย่า commit HTML เต็ม (gitignore reports/)
- Parse ด้วย regex เดียวกับ `src/zones.ts` `parseZones` + เพิ่ม regex หา `<img[^>]*usemap` + `<map><area>` + `#tableseats`
- เขียนสรุปลง `.wayfinder/references/T01-result.md` + `.wayfinder/tickets-ux/T01-result.md` (parent re-read path)

## Deliverable

- `references/T01-result.md` + `tickets-ux/T01-result.md` สรุป: imageUrl pattern, area count vs zone count,coords sample, tableseats rows/cols, 403 body sample, cache heal ได้ไหม
- สั้นๆ ใน issue comment: มีรูปให้ดึงสดไหม + ต้อง fallback อะไร

## Resolution 2026-09-03 — T01 closed ✅ (probe 340s)

**ผลยิงสดวันนี้**: `concert/ 200 114KB 20 queries` ปกติ แต่ `zones.php 504/650/622` + `fixed.php` ทั้งหมด `403 Access Denied 414B hard deny` (ไม่ใช่ 71B signin) — ไม่มี `<img usemap>`/`<area>`/`#tableseats` สดให้ parse เลย (พิสูจน์ `curl+jar+Referer [REDACTED]` + `fetch Firefox UA` + `wreq` ก็ 403 หมด)

**Cache heal**: `discover-cache.json` 21h old 12 events (8 มี `zones/k/rounds` ครบ) heal `zones` ได้ แต่ **ยังไม่มี `hallImageUrl/areas` field** จึงไม่มีรูปให้ heal — T03 ต้องเพิ่ม `parseHallImage()`+`parseAreas()` regex (`<img usemap>` → absolute URL, `<map><area shape poly coords>` → `number[]`) + เติม `hallImageUrl/areas[]` ลง `DiscoveredEvent` + heal เดียวกับ `zones` แล้วรอบที่ live 200 ค่อยเติม cache ใหม่

**Venue canvas/svg**: ไม่พบจริงในประวัติ TTM (`590×530 <img>` เดิม) — ให้ fallback pills-only + badge `map unavailable` เมื่อ `withMapCount==0`

Evidence: `.wayfinder/references/T01-result.md` + `.wayfinder/tickets-ux/T01-result.md` (20KB) + 5 HTML snippets `T01-html-*.html`
