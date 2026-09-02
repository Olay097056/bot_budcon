# A2-2 — IP score hygiene: probe rate + pattern ที่ไม่ทำให้คะแนน IP ตก

**Type**: research
**Status**: done ✅ 2026-09-02
**Label**: `wayfinder:research`

## Question

สมมติฐานจากวันนี้: เรายิงเทสหลายร้อยครั้ง (curl+wreq+fetch+browser ผสมกัน มี retry รัวๆ) ทำให้คะแนน IP/fingerprint ตก จน Firefox จริงโดน deny ด้วย คำถาม:

1. **Baseline**: ปัจจุบันระบบใช้ request ไป TTM เดือน/ชม./วันเท่าไหร่ (discover ทุก 30s + watch ทุก 5s + book + warm-up) — คิดเป็นตัวเลข
2. **Threshold**: ยิงเท่าไหร่ถึงเริ่มโดน deny — หา pattern จากการ probe แบบคุมตัวแปร (เพิ่มทีละ rate, วัด deny %) โดยไม่รุนแรง (ห้ามยิงเกิน 60 ครั้ง/ชม. ต่อ endpoint)
3. **Cookie hygiene**: curl ที่ผ่าน 100% ตอนนี้ ไม่ส่ง cookie เลย (concert) หรือส่ง auth jar (zones) — การส่ง cookie ถี่ๆ มีผลทำให้ session โดน flag ไหม
4. **Backoff policy**: เจอ 403/407 แล้วควรหยุดเท่าไหร่ (ใน map เก่าเป็น fog — ตอนนี้ต้องตัดสินใจจริง)

**Outcome**: ตัวเลข rate ที่ปลอดภัย + กฎ backoff + เปลี่ยน watch interval/polling ให้เข้ากับมัน

**Answer 2026-09-02**: done `reports/A2-2-ip-hygiene.md` (baseline 3480/h → 396/h -88.6%, budget curl 60-120/60-180, hygiene www 0 cookie, backoff 30→600s circuit-open 8, interval 15s/5m) — patch แล้ว `5d1ea30` + backoff นี้
