---
id: T04
title: Seat-grid UX prototype — ผังที่นั่งละเอียดในโซนจาก fixed.php กดเลือกที่นั่งได้
type: prototype
status: open
blocks: [T05]
blocked_by: []
---

## Question

เมื่อกดโซนแล้ว ผังที่นั่งละเอียดควรโชว์อย่างไรให้เลือกที่นั่งได้เห็นภาพ — ใช้ `#tableseats td[title] > div.seatuncheck` ที่มีจริง กดเลือก `quantity` ที่นั่งได้, เห็น `seatnotavail` เป็นสีเทา, มี loading/empty states

## What I need to know

1. จาก T01 fixed.php probe: `#tableseats` เป็นกี่แถวกี่คอลัมน์, `title="BB-08"` แมปกับตำแหน่งในตารางอย่างไร, มี legend สีอะไรบ้าง
2. UX ควรเป็น `grid` เล็กๆ ใต้ hall map หรือ `modal/drawer` แยก — แบบไหนไม่บัง hall map และยังกด "จองเลย" ต่อได้ลื่น
3. State: `no-seats` (โซนเต็ม `seatnotavail` ทั้งหมด), `loading` (กำลัง `fetch fixed.php`), `picked 2/3` (เลือก 2 จาก 3 ที่ขอ), `error errcode=9` (รอบยังไม่ขาย)
4. จะ reuse `src/book.ts` `pickSeats` logic (click `td[title]`) มาเป็น preview แบบไม่จองจริงได้อย่างไร

## Method

- Load skill `prototype` + `frontend-design`
- สร้าง 2 แบบ `ui/prototype-seats-a.html` / `ui/prototype-seats-b.html` ใช้ `seatuncheck/seatnotavail` mock 35 ที่นั่ง (ตาม `src/book.ts:314` logic) — แบบ A: grid ใต้ hall map, แบบ B: drawer/modal
- แต่ละแบบต้องมี: seat grid สี `--green` ว่าง / `--muted` ไม่ว่าง / `--amber` เลือกแล้ว, ตัวนับ `เลือก 2/1 ใบ`, ปุ่ม `จองเลย` enabled เมื่อเลือกครบ

## Deliverable

- `ui/prototype-seats-a.html`, `ui/prototype-seats-b.html` (2 แบบ) + เลือกแบบหนึ่ง
- สรุปใน issue: เลือก layout ไหน + เหตุผล + spec ให้ T05 ทำจริง (รวมสี/ขนาด/สถานะ)
