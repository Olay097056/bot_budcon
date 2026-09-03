## Destination

UX `bot_budcon` ทุกฟังก์ชันกดได้จริงผ่าน browser จริง — **ทุก event (12) ทุกโซน (ทุกรูป hall + ทุก seat grid) ไม่มีปุ่มตาย, ไม่มี 403 ว่าง, ไม่ hardcode** — เปิด `http://localhost:7890` แล้ว Discover→เลือกงาน→Watch→เลือกโซนบนรูป↔pills→ดูที่นั่ง→จอง→จ่าย ได้ครบทุกเคส รวม fallback 403/429/errcode9

## Notes

- **Stack**: `ui/index.html` เดียว (590→1100 บรรทัด hall+seat) + `src/server.ts` seats + `src/discover.ts` hallImageUrl/areas heal + `hardenedFetcher` chain — เพิ่งปิด `map-ux-seat 5/5 32f52db`
- **Skills**: wayfinder (map นี้), prototype (ถ้าแก้ UI), frontend-design/impeccable, browser-harness / computer-use สำหรับกดจริง
- **Preferences (กริลล์ 2026-09-03 ใหม่)**: Q1=runnable artifact (แก้ให้กดได้เลย), Q2=local-markdown (.wayfinder), Q3=browser จริงทุกฟังก์ชัน, Q4=ทุก event 12 + ทุกโซน — no sample
- **Antipattern guard**: ห้าม hardcode รูปตาม venue, ห้ามแก้ Akamai ชั้น transport ใน map นี้ (อยู่ map-akamai2), ต้องทดสอบจริงด้วย `drive_preview`/`browser_exec` ไม่ใช่แค่ vitest

## Decisions so far

<!-- index of closed tickets — empty at chart time -->

## Not yet specified

- จะทำ seat auto-pick ตาม `quantity` เมื่อ user ไม่ได้กดเลือกที่นั่งเองอย่างไรให้ตรงกับ `book.ts pickSeats` เดิม
- จะเพิ่ม e2e แบบ headless คลุมทุก event หลังแก้เสร็จหรือไม่

## Out of scope

- Paid proxy/unlocker, sensor_data Go binary — อยู่ map-akamai2 Q3=A free-only
- แยกหน้าใหม่นอก `ui/index.html` — ต้องอยู่ในไฟล์เดียว
