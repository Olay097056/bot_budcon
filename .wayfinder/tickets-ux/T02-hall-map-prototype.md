---
id: T02
title: Hall map UX prototype — กดบนรูปเลือกโซนได้ + pills sync สองทาง
type: prototype
status: open
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
