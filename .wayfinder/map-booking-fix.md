## Destination

Booking ชนะคน/บอทอื่น: กดจองถึง fixed.php ใน <2s ไม่ timeout, กดบนผังฮอลล์ตรงโซนตามรูป TTM ทุก event — ผ่าน browser จริง `localhost:7890`

## Notes

- **Stack**: `src/book.ts` `src/watch-manager.ts` `src/ttm-fetch.ts` `src/discover.ts` `ui/index.html` `src/bot-engine.ts`
- **Skills**: wayfinder, prototype, frontend-design
- **Constraints**: ฟรีเท่านั้น (ไม่ใช้ paid proxy), ต้องผ่าน `ttm-fetch` hardened chain, `BOT_BUDCON_WATCH_MS` ปรับได้, seat grid ต้องรองรับ fixed/festival
- **Lab**: manual login `BOT_BUDCON_HEADLESS=0` + `curl /api/events/discover?limit=18` + browser `localhost:7890` ทดสอบ กดจริง

## Decisions so far

- [T02 กดจองแล้ว Timeout 30s](tickets-booking-fix/T02-click-timeout.md): เปลี่ยน `btn.click({force:true})` → `evaluate(el.click())` + catch Timeout/detached = success if navigated, ลด wait 10s→5s — 121 passed
- [T03 กดบนผังแล้วไม่ตรงรูป](tickets-booking-fix/T03-hall-alignment.md): viewBox ต้อง `590x530` (image size) ไม่ใช่ `529x496` (coords max) + rect 2 จุด→4 จุด — browser verify 741 ตรงแล้ว
- [T01 ทำไมระบบจองช้า](tickets-booking-fix/T01-speed-audit.md): bottleneck 3 ขั้น ~4.5s — ลด round_change 1500→700, nav 15s→8s, pickSeats 600→250 — burst `BOT_BUDCON_WATCH_BURST=1` 3s สำหรับ on-sale 5 นาที

## Not yet specified

## Out of scope

- ระบบชำระเงิน/3-D Secure (humanStep)
- paid proxy/unlocker
