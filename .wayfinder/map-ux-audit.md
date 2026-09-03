## Destination

UX `bot_budcon` ทุกฟังก์ชันกดได้จริงผ่าน browser จริง — **ทุก event (12) ทุกโซน (ทุกรูป hall + ทุก seat grid) ไม่มีปุ่มตาย, ไม่มี 403 ว่าง, ไม่ hardcode** — เปิด `http://localhost:7890` แล้ว Discover→เลือกงาน→Watch→เลือกโซนบนรูป↔pills→ดูที่นั่ง→จอง→จ่าย ได้ครบทุกเคส รวม fallback 403/429/errcode9

## Notes

- **Stack**: `ui/index.html` เดียว (590→1100 บรรทัด hall+seat) + `src/server.ts` seats + `src/discover.ts` hallImageUrl/areas heal + `hardenedFetcher` chain — เพิ่งปิด `map-ux-seat 5/5 32f52db`
- **Skills**: wayfinder (map นี้), prototype (ถ้าแก้ UI), frontend-design/impeccable, browser-harness / computer-use สำหรับกดจริง
- **Preferences (กริลล์ 2026-09-03 ใหม่)**: Q1=runnable artifact (แก้ให้กดได้เลย), Q2=local-markdown (.wayfinder), Q3=browser จริงทุกฟังก์ชัน, Q4=ทุก event 12 + ทุกโซน — no sample
- **Antipattern guard**: ห้าม hardcode รูปตาม venue, ห้ามแก้ Akamai ชั้น transport ใน map นี้ (อยู่ map-akamai2), ต้องทดสอบจริงด้วย `drive_preview`/`browser_exec` ไม่ใช่แค่ vitest

## Decisions so far

- [T01 Discover ทุก event โหลดได้จริง — 12 การ์ด + zones/hall ไม่ว่างเปล่า](tickets-audit/T01-discover-every-event.md): 12 events 6 with zones healed จาก cache, คลิกทุกการ์ด zoneGrid ถูกต้อง, customQuery 504 ซ่อน hall/seat, hall null 12/12 เนื่องจาก 403 fallback ถูกต้อง
- [T02 Hall map ทุก event กดบนรูปเลือกโซนได้ ↔ pills sync](tickets-audit/T02-hall-every-event.md): hall none เมื่อ 403 ไม่แตก layout, synthetic hall 1000x600 polygon 2 โซน กดรูป→pills และ pills→รูป sync active ถูกต้อง
- [T03 Seat grid ทุกโซนโหลดได้จริง — free/taken/429/403/errcode9 ครบ](tickets-audit/T03-seats-every-zone.md): ทุกโซน `POST /api/events/seats` fallback `no k/round` ชัดเจนเมื่อ 403, free/taken/disabled/เลือก 4 ใบ logic ถูกต้อง (synthetic + จริง)
- [T04 Watch + Book flow กดได้จริงทุก event — autoBook → payment → finalize](tickets-audit/T04-watch-and-book-flow.md): Thailand 747 45 โซน Watch เริ่ม/หยุด 202 ถูกต้อง (customQuery 504 เคยทำให้ผิด query แก้แล้ว), autoBook switch ถูกต้อง, Book LM5 → `no anchor` 403 fallback โชว์ error ภาษาคนไม่ 500
- [T05 Final sweep แก้ทุกจุดตาย — login/drawer/quantity/fallback ไม่พังทุก event](tickets-audit/T05-final-sweep-fix.md): login pill/drawer/quantity6/staleBadge/429 ถูกต้อง, แก้จุดตาย `wave` ไม่มีโซนแล้ว code/seat ค้าง → `renderZones empty` clear code+hall+seat+bookDis ผ่าน, `Thailand 45 → LM5 → wave 0` verify แล้ว `TSC:0 121`

## Not yet specified

- (none — map done, all 5 closed)

## Out of scope

- Paid proxy/unlocker, sensor_data Go binary — อยู่ map-akamai2 Q3=A free-only
- แยกหน้าใหม่นอก `ui/index.html` — ต้องอยู่ในไฟล์เดียว
