## Destination

Dashboard `bot_budcon` โชว์ผังจริงจาก TTM ได้ใช้งานทันที — **ขั้น 3 เลือกโซนเห็นผังฮอลล์รวมจาก `zones.php` (`<img usemap>` + `<area coords>`) กดบนรูปเลือกโซนได้, pills sync ทั้งสองทาง, พอกดโซนแล้วเห็นผังที่นั่งละเอียดจาก `fixed.php#<code>` (`#tableseats` `seatuncheck/seatnotavail`) กดเลือกที่นั่งได้** — ดึงสด realtime ไม่ hardcode เลย, มี fallback `cache/placeholder` เมื่อ `403` ไม่โชว์ว่าง, อยู่ใน `ui/index.html` ไฟล์เดียว

## Notes

- **Stack**: Node + TypeScript + Playwright persistent Firefox + `ttm-fetch` chain (`curl→wreq→fetch→browser`) + `discover-cache` heal + Vite single-file `ui/index.html` (เดิม pills อย่างเดียว)
- **Skills**: wayfinder (map นี้), prototype, frontend-design, impeccable — ดู `ui/index.html` เดิม 879 บรรทัด + `src/zones.ts` + `src/book.ts` `pickSeats` + `src/discover.ts` เป็นฐาน
- **Preferences (จากกริลล์ 2026-09-03)**: runnable artifact (ไม่ใช่ spec), ทั้งสองผัง (hall + seat-grid), realtime ไม่ hardcode + cache/placeholder fallback, กดบนรูปได้ + pills sync
- **Antipattern guard**: ห้าม hardcode รูปตาม venue, ห้ามเพิ่ม paid proxy, ห้ามทำ sensor_data reverse, ต้อง reuse `hardenedFetcher` + `discover-cache` เดิม

## Decisions so far

- [T01 Live TTM HTML probe — รูปผังฮอลล์ + coords + ตารางที่นั่ง มีอะไรให้ดึงสดบ้าง](tickets-ux/T01-live-html-probe.md): สดวันนี้ `concert 200` แต่ `zones+fixed` 403 hard deny 414B ไม่มี `<img>/<area>/#tableseats` ให้ parse — cache 21h old 8 zones heal ได้แต่ยังไม่มี `hallImageUrl/areas` ต้องรอ T03 เติม `parseHallImage/parseAreas` regex + heal เดียวกับ zones
- [T02 Hall map UX prototype — กดบนรูปเลือกโซนได้ + pills sync สองทาง](tickets-ux/T02-hall-map-prototype.md): สร้าง A+B 2 แบบ — **เลือก A เป็นหลัก** `map-wrap 590×420 img+svg polygon overlay hover cyan active cyan glow` pills ล่าง sync + seat-grid ใต้รูป, B เป็น split tier เก็บไว้

## Not yet specified

- สี/สถานะที่นั่ง `seatnotavail` vs `seatuncheck` vs `seatchecked` จะแมปเป็นสีอะไรให้อ่านง่ายบนพื้นมืด — รอ T04
- ประสิทธิภาพเมื่อฮอลล์ใหญ่ 45 โซน + ตารางที่นั่ง 35 ที่นั่ง/โซน — ต้อง virtualize ไหม — รอ T04

## Out of scope

- Hardcode รูปผังตาม venue / manual อัปโหลดรูป — ขัด realtime ไม่ hardcode ที่ล็อคไว้
- Paid proxy / unlocker / captcha service — Q3=A free-only เดิม
- Sensor_data / Go binary wrapper — Phase-2 ยังไม่ deploy
- แยกหน้าใหม่นอก `ui/index.html` — ต้องอยู่ในไฟล์เดียวตาม stack เดิม
