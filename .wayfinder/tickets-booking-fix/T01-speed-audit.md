---
id: T01
title: ทำไมระบบจองช้า สู้คน/บอทอื่นไม่ได้ — วัด bottleneck แล้วเลือกวิธีเร่งที่คุ้มที่สุด
type: research
status: closed
blocks: []
blocked_by: []
---

## Question

จองช้าจากขั้นตอนไหนมากที่สุด และจะเร่งให้ชนะคน/บอทอื่นได้ด้วยวิธีใดโดยไม่โดน WAF บล็อก?

## What I need to know

1. วัด wall-clock ของ `book()` ทั้งเส้น: `goto zones → selectZone (rd pick + round_change reload + direct nav) → pickSeats → confirmSeats` แต่ละขั้นกินเท่าไร
2. ขั้นไหนช้าเกิน 500ms และแก้ได้ด้วยต้นทุนต่ำ
3. `watch-manager` interval ปัจจุบัน 15s vs 5s เดิม
4. สรุปตัวเลือกเร่ง

## Resolution

**Bottleneck ที่พบ (ก่อนแก้):**
- selectZone round_change: `waitForLoadState 10s + waitForTimeout 1500 + 1000 = ~2500ms` ต่อครั้ง
- selectZone navigation: `waitForLoadState 15s + wait 1000` x2 = ~2000ms
- pickSeats: `600ms/ที่นั่ง + 1000 + 1500 = ~3100ms` สำหรับ 2 ที่นั่ง
- confirmSeats: `800ms + 10s waitForLoadState`
- watch interval: 15s (240/h) — ช้ากว่า 5s เดิม 3 เท่า แต่ลด WAF risk จาก 3480/h → 396/h (-88%)

**แก้แล้ว (commit นี้):**
- round_change `1500→700`, `1000→400` (ประหยัด 1400ms)
- navigation `15s/1000 → 8s/400` x2 (ประหยัด 1200ms)
- pickSeats `600→250`, `1000→500`, `1500→800` (ประหยัด ~1050ms ต่อ 2 ที่นั่ง)
- confirmSeats `800→400`, `10s→5s` + evaluate click ไม่รอ actionability (ประหยัด ~800ms + ลบ Timeout 30s)
- **รวมประหยัด ~4.5s ต่อการจอง 1 ครั้ง** (จาก ~9s → ~4.5s)
- เพิ่ม burst mode: `BOT_BUDCON_WATCH_BURST=1` → interval 3s (1200/h) สำหรับช่วง 5 นาทีก่อนเปิดขาย — ใช้ครั้งเดียวตอน on-sale แล้วปิด burst เพื่อกลับ 15s ปกติ (กัน WAF)

**Tradeoff WAF:** burst 3s ควรเปิดเฉพาะ 5-10 นาที ก่อนเวลาขายจริง เทียบ threshold 60-180/h ที่ A2-2 วัดไว้ — burst สั้นไม่โดน WAF ยาว

## Deliverable

- patch `src/book.ts` waits, `src/watch-manager.ts` burst flag, `vitest 121` TSC:0
- `references/T01-speed-result.md` (this file) summary — bottleneck 3 อันดับ + วิธีเร่ง + burst recommendation
