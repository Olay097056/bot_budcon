# A2-3 24h probe — อัปเดต 2026-09-03 04:09 ICT (running)

**Ticket**: `03-24h-probe.md` · **Lab**: `A2` Akamai round-2
**Probe**: `scripts/a2-3-24h-probe.ts --duration 24h` กำลังรัน background → `.wayfinder/reports/a2-3-probe.jsonl`
**Jar**: 4450 chars `PHPSESSID+_abck+bm_sv` (login 02:43 → อายุ 25 ชม. เกินอายุแล้ว แต่ concert ยังผ่าน)
**Server**: `81411cf` + `64c062e` — cache-sync spawn ไม่ฆ่า server แล้ว, preview 1/30s, discover heal 6 zones จาก cache แม้ zones 403

## ผลล่าสุด 2026-09-03 04:09 (24 entries, รันมา ~30 นาที)

| endpoint | pass | detail |
|----------|------|--------|
| concert (www no-cookie curl/8.0.1) | **7/7 = 100%** ✅ | 200 114-115KB hits19-20 ทุกครั้ง |
| zones q=504/650/747 (booking+jar) | **0/15 = 0%** ❌ | 403 418B `Access Denied` ทุกครั้ง |
| fixed | 0/2 = 0% | skip (ไม่มี k เพราะ zones 403) |
| discover `/api/events/discover?limit=12` | ⚠️ healed | 12 events แต่ `live 0 + healed 6` จาก cache (cache 22h old, 8 zones เดิม → heal 6) — UI ยังมี 6 การ์ดมีโซนให้ Watch/Book ได้ |

**overall live**: 7/24 = 29% — ยัง fail เกณฑ์ 95% เพราะ booking host hard deny
**overall with cache heal**: discover ยังใช้งานได้ (6/12 มีโซน) — ตรงตาม resilience ที่ออกแบบไว้ `1aecf22`

เทียบเมื่อเช้า 2026-09-02 09:xx `zones 3/3 200` → ตกเป็น `0/15 403` หลัง baseline 3480/h 7 ชม. — IP score booking ตกแล้ว ต้อง cooling

## สิ่งที่พิสูจน์แล้ว

- concert no-cookie ทน 100% แม้ booking โดน 403 — แยก host ตาม hygiene A2-2 ถูกต้อง
- discover heal ทำงานจริง: แม้ `zones live 0` ก็คืน `6 zones` จาก `cache/discover-cache.json` (8 zones) ให้ UI ไม่ว่าง
- server ไม่ดับแล้วหลัง `64c062e` (spawn แทน import+exit)
- preview 1/30s กันยิงรัวแล้ว (`81411cf`)

## Next

1. ปล่อย probe รันต่อครบ 24h (ตอนนี้ 04:09 → ครบ 04:09 พรุ่งนี้) — เก็บ JSONL 12/h
2. หลังครบ 24h ค่อยประเมิน pass% แยก host: concert ต้อง ≥95% (ตอนนี้ 100%), booking อาจยัง 0% จนกว่าจะ cooling 30m + refresh jar
3. ถ้า booking ยัง 0% ตลอด 24h → สรุปในรายงานว่า IP เดียวนี้โดน score ตกแล้ว ต้องใช้ cache-heal เป็นหลัก + แนะนำ cooling ก่อนวัน D ตาม playbook A2-4
4. ปิด ticket 03 เมื่อครบ 24h + มีกราฟ pass% ต่อชั่วโมง

## ไฟล์

- `scripts/a2-3-24h-probe.ts` (loop 10m/15m/30m jitter ±20%)
- `.wayfinder/reports/a2-3-probe.jsonl` (24 entries, อัปเดต realtime)
- `.wayfinder/reports/A2-3-24h-probe-initial.md` (ผล --once รอบแรก)
- `cache/discover-cache.json` (8 zones, heal source)
