---
id: T03
title: กดบนผังแล้วไม่ตรงรูป — แก้ coords/image scale ให้ hit-test ตรงทุก event
type: prototype
status: closed
blocks: []
blocked_by: []
---

## Question

ทำไม polygon บน `hallSvg` กดแล้วไม่ตรงรูป `hallImg` ที่ดึงมา และจะแก้ scale/alignment ให้ตรงทุก event ได้อย่างไร?

## Resolution

**สาเหตุ 2 อย่าง:**
1. **viewBox ผิด:** เดิม `viewBox = max(coords) = 529x496` แต่รูปจริง `590x530` (จาก `<img width="590" height="530">`) — aspect ต่าง `1.06 vs 1.11` ทำให้ `svg preserveAspectRatio:meet` letterbox ไม่ตรง `img width:100% height:auto` → polygon เลื่อน/ยืด
2. **rect polygon ผิด:** `shape="rect" coords="160,58,422,363"` มี 2 จุด แต่ code เดิมสร้าง `polygon points="160,58 422,363"` (เส้นทแยงมุม) แทนที่จะเป็นสี่เหลี่ยม 4 มุม → hit area เล็กมาก กดไม่โดน

**วิธีแก้:**
- `src/discover.ts`: เพิ่ม `parseHallImageMeta()` แยก `src` + `width` + `height` จาก `<img>` tag, เก็บ `hallImageWidth/Height` ใน `DiscoveredEvent` + heal จาก cache (commit ใหม่ cache 18 events มี wh แล้ว)
- `ui/index.html` renderHall:
  - ตั้ง `img width/height` attr จาก `ev.hallImageWidth/Height` ก่อนโหลด เพื่อให้ viewBox ถูกต้องแม้ `naturalWidth` ยังไม่มา
  - คำนวณ `vbW/vbH = max(naturalWidth|widthAttr, maxCoords)` แล้ว `svg viewBox = 0 0 vbW vbH` (ตอนนี้ 741 → `0 0 590 530` ตรงกับรูป)
  - `img.onload` อัปเดต viewBox เป็น `naturalWidth/naturalHeight` อีกครั้งเมื่อรูปโหลดเสร็จ
  - แก้ rect: `if shape rect && coords.length===4` → `points = x1,y1 x2,y1 x2,y2 x1,y2` (เดิม 2 จุด → 4 จุด)
- CSS เดิม `hall-stage img {width:100% height:auto}` + `svg {position:absolute inset:0}` ให้ container height ตาม img → svg เต็มพื้นที่เดียวกัน เมื่อ viewBox ตรง aspect จึงตรงกันพอดี

**ทดสอบ:** browser `localhost:7890` เลือก 741 → `imgNat 590x530` / `svgVB 0 0 590 530` / `polys 4 จุดครบ` (A `160,58 422,58 422,363 160,363`) — กด polygon A → `activePoly A` sync กับปุ่มโซน A ตรงรูป

## Deliverable

- patch `src/discover.ts` + `ui/index.html` + `cache/discover-cache.json` 18 events (10 with hall)
