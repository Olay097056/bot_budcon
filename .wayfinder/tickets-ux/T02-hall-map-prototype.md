---
id: T02
title: Hall map UX prototype — กดบนรูปเลือกโซนได้ + pills sync สองทาง
type: prototype
status: closed
blocks: [T05]
blocked_by: []
---

## Question

ผังฮอลล์รวมในขั้น 3 ควรหน้าตาและโต้ตอบอย่างไรให้ "เห็นภาพเวลาเลือกโซน" จริง — กดบนรูปได้, pills sync ทั้งสองทาง, มี loading/empty/403 fallback, เข้ากับธีม `ui/index.html` มืด `--void/--panel` เดิม

## What I need to know

1. Layout: รูปผังควรอยู่ตำแหน่งไหนในขั้น 3 — บน pills / แทน pills / ข้าง pills — บนจอ 860px single column ยังอ่านง่ายไหม
2. Interaction: hover โซนบนรูปไฮไลท์อย่างไร, กดแล้ว active state สีอะไร (`--cyan`/`--amber`/`--paper`), pills ข้างล่าง sync ทันทีอย่างไร
3. States: `loading` (กำลังดึง `zones.php` image), `empty` (ยังไม่เลือกงาน), `403/healed` (โชว์ cache image + amber badge), `no-image` (venue ไม่มีรูป — โชว์ pills อย่างเดียว)
4. เทียบ 2-3 แบบแล้วเลือกแบบที่ "เห็นภาพที่สุด" โดยไม่บัง pills และไม่ต้อง scroll มาก

## Method

- Load skill `prototype` + `frontend-design` + `impeccable`
- สร้าง 2-3 แบบเป็น `ui/prototype-hall-*.html` แบบ throwaway (ไม่แก้ `ui/index.html` จริง) — ใช้รูป placeholder + coords ตัวอย่างจาก `src/zones.ts` test fixtures ก่อน
- แต่ละแบบต้องมี: hall image (placeholder), overlay clickable zones (ใช้ `<img usemap>` หรือ `svg polygon` overlay), pills ด้านล่าง sync, badge/loading states

## Deliverable

- `ui/prototype-hall-a.html`, `ui/prototype-hall-b.html` (2 แบบ) + ภาพ screenshot หรือคำอธิบายเลือกแบบหนึ่ง
- สรุปใน issue: เลือกแบบไหน + เหตุผล + spec สั้นๆ ให้ T05 ไปทำจริง

## Resolution 2026-09-03 — T02 closed ✅ — เลือกแบบ A เป็นหลัก, B เป็นทางเลือก

**Prototype A** (`ui/prototype-hall-a.html` 11KB): `map-wrap` เต็มความกว้าง 590×420 `img + svg polygon` overlay `fill rgba + stroke` hover `cyan` active `cyan 92% + glow`, pills ล่าง sync สองทาง, `seat-grid` 12 cols ใต้รูป (mock 24 seats `free/taken/picked`), states `loading/healed/ok/empty` ครบ — อ่านง่ายสุดบน 860px single column ไม่ต้อง split

**Prototype B** (`ui/prototype-hall-b.html` 10KB): split `1.55fr/.85fr` รูปซ้าย chips ขวา tier A/B/C แยก + bar ว่าง, seat-grid แถวสั้น — เลือกเร็วแต่แคบบนมือถือ ต้อง responsive ซับซ้อนกว่า

**Decision**: **เอา A เป็นหลัก** — ตรง brief "เห็นภาพเวลาเลือกโซน" ชัดกว่า (รูปใหญ่เต็ม), sync `svg polygon active ↔ pill active` สี `cyan` (map) / `paper` (pills) เท่ากัน, `seat-grid` อยู่ใต้รูปไม่บัง hall — T05 จะ wire แบบ A ลง `ui/index.html` จริง (ใช้ `svg polygon` จาก `areas[].coords` scale ตาม `viewBox`) + เก็บ B ไว้เป็นทางเลือกถ้าอยากทำ split ทีหลัง

Evidence: `ui/prototype-hall-a.html`, `ui/prototype-hall-b.html` เปิดด้วย `desktop_preview` ได้ทันที
