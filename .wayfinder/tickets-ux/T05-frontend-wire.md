---
id: T05
title: Frontend wire — เอาผังฮอลล์ + ผังที่นั่งขึ้น dashboard จริง pills sync สองทาง + fallback
type: task
status: open
blocks: []
blocked_by: []
---

## Question

จะ wire `hallImage + areas + seat-grid` ลง `ui/index.html` จริงให้ใช้งานได้อย่างไร — กดบนรูปเลือกโซนได้, pills sync ทั้งสองทาง, โชว์ seat-grid เมื่อเลือกโซน, มี loading/empty/403-healed states ครบ, ไม่พัง flow `Watch/Book` เดิม

## What I need to know

1. จะ render hall image อย่างไรให้ clickable zones ตรงพิกัดเดิมเมื่อรูป responsive (ต้อง scale coords ตาม `naturalWidth/clientWidth` หรือใช้ `svg polygon` overlay)
2. จะ sync state `selected.code` ระหว่าง hall map ↔ pills ↔ seat-grid อย่างไร — แก้ `renderZones()` + `syncSelectedUI()` เดิม (บรรทัด 506-533) อย่างไรให้ไม่แตก
3. จะ fetch `fixed.php` seat-grid แบบ preview (ไม่จองจริง) ได้อย่างไร — เพิ่ม `POST /api/events/seats {zonesUrl, code}` หรือ reuse `POST /api/book/start` แบบ dry-run
4. Fallback: เมื่อ `hallImageUrl==null` (403/cache miss) โชว์อะไร — ซ่อนรูปโชว์ pills อย่างเดียว + `staleBadge` เดิม (`discover.ts:310 healed ...`)

## Method

- รอ T02+T03+T04 ปิดก่อน — เอา spec ที่เลือก + API shape `hallImageUrl/areas` จริงมา wire
- แก้ `ui/index.html` เพิ่ม `hallMap` container ใต้ `zoneGrid` (หรือแทน) — ใช้ `svg` overlay `polygon` จาก `areas[].coords` ทับ `<img>` เพื่อให้ scale ได้แม่นยำ (ไม่ใช้ `<map>` ที่ scale ยาก)
- เพิ่ม `fetchSeatsPreview()` เรียก `POST /api/events/seats` ใหม่ (backend เพิ่มใน T03 หรือ T05) แล้ว render seat-grid ใต้ hall map
- เขียน `ui/index.test` หรือ manual verify: กดรูป→pills active, กด pills→รูปไฮไลท์, กดที่นั่ง→นับ `quantity` ถูกต้อง, 403→โชว์ cache image

## Deliverable

- `ui/index.html` เดียวจบ — กดเลือกโซนบนรูปได้จริง, pills sync สองทาง, กดโซนแล้วเห็น seat-grid กดเลือกที่นั่งได้, ผ่าน `tsc --noEmit` + `vitest` เดิมไม่พัง
- Verify: `curl /api/events/discover?limit=1` มี `hallImageUrl` + เปิด `http://localhost:7890` กดโซนบนรูปแล้ว `bookBtn` enabled + `seat-grid` ขึ้น
