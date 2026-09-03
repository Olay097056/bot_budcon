# Akamai Resilience — round 2 (Akamai hardened, IP scored)

**Map label**: `wayfinder:map`
**Started**: 2026-09-02
**Status**: doing

## Destination

bot อยู่รอด Akamai ได้ทุก endpoint ที่ใช้ (concert/, zones.php, fixed.php, booking flow) — วัดผลเป็นตัวเลข: **24 ชม. ต่อเนื่อง ≥95% pass rate** จาก probe อัตโนมัติ และ **วัน on-sale สำคัญต้องไม่มี deny แม้แต่ครั้งเดียว** (Q2=A+B) โดยขอบเขตคือ **bot API เท่านั้น** — มนุษย์ browse เองไม่อยู่ใน scope (Q1=A) และ **ฟรี 100% ห้ามใช้จ่าย** (Q3=A)

## Notes

- **Stack เดิม**: chain `curl → wreq-js → node fetch → Playwright browser` + cache hydrate + self-hosted runner (จาก map ก่อน — ปิดแล้ว)
- **สถานการณ์ 2026-09-02**: Akamai ยกระดับ — Firefox จริงของ user โดน deny บน booking.* (`Reference #18.9cd...`), playwright firefox โดนทุก profile แต่ **curl ยังผ่าน 100%** (concert 3/3 โดยไม่มี header, zones 3/3 ด้วย auth jar) → แปลว่าเป็น fingerprint/IP-scoring ไม่ใช่ IP ban เด็ดขาด
- **ข้อจำกัดจาก user**: Q4=B — ไม่มี IP สำรองให้ทดสอบ (ไม่มี hotspot/เครื่องอื่น) — ทุกวิธีต้องทำงานบน IP เดียวนี้
- **Skills**: wayfinder, grilling, research
- **Antipattern guard**: ห้ามเริ่มทำ sensor_data reverse (ยังไม่มีหลักฐานว่าจำเป็น); ห้ามจ่ายเงิน; ห้ามทดสอบรุนแรงจน IP โดน ban ถาวร (จำกัด probe rate)

## Decisions so far

- [Grilling round 1 — destination locked](grilling-2026-09-02.md): Q1=A bot-only scope, Q2=A+B 24h≥95% + on-sale zero-deny, Q3=A free-only ยืนยันล็อค, Q4=B no alt IP — ทุก ticket ต้องทำงานบน IP เดียว
- [สถานะจริงวันนี้ — curl ยังผ่าน 100%](../../scripts/stability-probe.ts): concert/ 3/3 (124KB 22 queries, no headers), zones.php 3/3 (56KB 15 anchors, auth jar) — แต่ playwright firefox (ทุก profile) และ Firefox จริงของ user โดน deny บน booking.* → จุดตายคือ browser-dependent steps (book flow ที่ต้อง playwright) ไม่ใช่ discovery
- [A2-1 ✅ DONE 2026-09-02](reports/A2-1-curl-booking.md): curl-only booking ทำได้จริง — zones.php 200 53KB → fixed.php 200 67KB tableseats 35 → validateseat 200 {"result":true} ด้วย curl/8.0.1 + full jar + Referer zones?query ล้วน ไม่ต้องเปิด browser (proof scripts/a2-1-curl-booking-probe.ts 3 req, Firefox UA → 403 แต่ curl/8.0.1 → 200); bookingseats→payment skip ไม่ยิงจริง
- [A2-2 ✅ DONE 2026-09-02](reports/A2-2-ip-hygiene.md): baseline 3,480/h (discover 79% warm-up 13/boot watch 720/h) → safe budget curl concert 60-120/h zones 60-180/h browser 10-20/h, cookie hygiene www 0 cookie / booking full jar+Referer, backoff 30→60→120→300→600s + circuit-open 8 fail + interval ใหม่ watch 5s→15s (240/h) discover 30s/30→5m/12 ลด -88.6% เหลือ 396/h — patch แล้ว ui limit 12 + 5m jitter + watch 15s + ttm-fetch www no-cookie + watch-manager backoff/circuit + ui degraded pill TSC 0 118/118
- [A2-3 ⏳ RUNNING 2026-09-03](reports/A2-3-24h-probe-initial.md): initial --once concert 100% (2/2) แต่ zones 0/6 403 + discover 0/12 → IP booking hard deny หลัง 3480/h 7 ชม. — ต้อง cooling 30m แล้ว 24h loop 12/h (scripts/a2-3-24h-probe.ts --duration 24h กำลังรัน proc_febcf242c579 → .wayfinder/reports/a2-3-probe.jsonl, discover heal คืน 7 zones จาก cache แม้ 403)
- [A2-4 ✅ DRAFT 2026-09-02](reports/A2-4-onsale-playbook.md): pre-flight 7 + silence 30m + curl-first 5 ขั้น (curl/8.0.1 เท่านั้น) + ladder 30→600s circuit 30m + strict 138/h รอ A2-3 ผ่านจึงล็อค final — preview 1/30s + jar refresh x2 soft-block + cache-sync spawn แก้ server ดับแล้ว 64c062e

## Not yet specified

- _abck expiry จริงกี่นาที — ต้องวัดจาก 24h probe (A2-3) ที่กำลังรัน

## Out of scope

- มนุษย์ browse Firefox เอง (Q1=A) — user ยอมรับว่า Firefox จริงโดนก็ไม่เป็นไร ขอแค่ bot รอด
- จ่ายเงินทุกชนิด (proxy, unlocker, captcha service) — Q3=A
- เครื่อง/IP สำรอง, self-hosted runner ที่ II (Q4=B)
- sensor_data reverse engineering (ยังไม่มี evidence ว่า Akamai ลง Phase-2)
