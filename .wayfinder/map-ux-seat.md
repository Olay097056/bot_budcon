## Destination

Dashboard `bot_budcon` โชว์ผังจริงจาก TTM ได้ใช้งานทันที — **ขั้น 3 เลือกโซนเห็นผังฮอลล์รวมจาก `zones.php` (`<img usemap>` + `<area coords>`) กดบนรูปเลือกโซนได้, pills sync ทั้งสองทาง, พอกดโซนแล้วเห็นผังที่นั่งละเอียดจาก `fixed.php#<code>` (`#tableseats` `seatuncheck/seatnotavail`) กดเลือกที่นั่งได้** — ดึงสด realtime ไม่ hardcode เลย, มี fallback `cache/placeholder` เมื่อ `403` ไม่โชว์ว่าง, อยู่ใน `ui/index.html` ไฟล์เดียว

## Notes

- **Stack**: Node + TypeScript + Playwright persistent Firefox + `ttm-fetch` chain (`curl→wreq→fetch→browser`) + `discover-cache` heal + Vite single-file `ui/index.html` (เดิม pills อย่างเดียว)
- **Skills**: wayfinder (map นี้), prototype, frontend-design, impeccable — ดู `ui/index.html` เดิม 879 บรรทัด + `src/zones.ts` + `src/book.ts` `pickSeats` + `src/discover.ts` เป็นฐาน
- **Preferences (จากกริลล์ 2026-09-03)**: runnable artifact (ไม่ใช่ spec), ทั้งสองผัง (hall + seat-grid), realtime ไม่ hardcode + cache/placeholder fallback, กดบนรูปได้ + pills sync
- **Antipattern guard**: ห้าม hardcode รูปตาม venue, ห้ามเพิ่ม paid proxy, ห้ามทำ sensor_data reverse, ต้อง reuse `hardenedFetcher` + `discover-cache` เดิม

## Decisions so far

<!-- index of closed tickets. Gist + link. Empty at chart time. -->

## Not yet specified

- Venue ที่รูปผังเป็น `canvas/svg` แทน `<img usemap>` จะ handle ยังไง — รอ T01 probe ก่อน
- สี/สถานะที่นั่ง `seatnotavail` vs `seatuncheck` vs `seatchecked` จะแมปเป็นสีอะไรให้อ่านง่ายบนพื้นมืด — รอ T02 prototype
- ประสิทธิภาพเมื่อฮอลล์ใหญ่ 45 โซน + ตารางที่นั่ง 35 ที่นั่ง/โซน — ต้อง virtualize ไหม — รอ T04

## Out of scope

- Hardcode รูปผังตาม venue / manual อัปโหลดรูป — ขัด realtime ไม่ hardcode ที่ล็อคไว้
- Paid proxy / unlocker / captcha service — Q3=A free-only เดิม
- Sensor_data / Go binary wrapper — Phase-2 ยังไม่ deploy
- แยกหน้าใหม่นอก `ui/index.html` — ต้องอยู่ในไฟล์เดียวตาม stack เดิม
