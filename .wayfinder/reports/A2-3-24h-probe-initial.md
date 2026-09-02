# A2-3 24h probe — ผลรันจริงรอบแรก (initial run 2026-09-02 15:33 ICT)

**Ticket**: `03-24h-probe.md` · **Lab**: `A2` Akamai round-2
**Probe**: `scripts/a2-3-24h-probe.ts --once` (5 entries: 1 concert + 3 zones + 1 fixed)
**Jar**: 4450 chars `PHPSESSID+_abck+bm_sv` ครบ (แต่หมดอายุ ~7 ชม.หลัง login 02:43)
**OUT**: `.wayfinder/reports/a2-3-probe.jsonl` (10 entries รวมรันซ้ำ 2 ครั้ง)

## ผลลัพธ์รอบแรก

| endpoint | status | bytes | ms | ok | detail |
|----------|--------|-------|----|----|--------|
| concert (www no-cookie, curl/8.0.1) | 200 | 112985 | 1466-2067 | ✅ 100% (2/2) | hits=21 hasConcert=true |
| zones q=504 (booking+jar+Referer www) | 403 | 418 | 296-633 | ❌ 0% (0/6) | WAF Access Denied `Reference #18.b6e4c817...` |
| zones q=650 | 403 | 418 | 287 | ❌ | Access Denied |
| zones q=747 | 403 | 418 | 278 | ❌ | Access Denied |
| fixed 504/D1 | skip | 0 | 0 | ❌ | skip no k/round (zones 403 → ไม่มี k) |
| discover via server `/api/events/discover?limit=12` | 200 | — | — | ⚠️ degraded | events 12 แต่ `zones []` ทั้ง 12 (0/12 with zones), warnings [] — live fetch ได้ 0, เหลือแค่ title จาก concert |

**overall**: 2/10 = 20.0% — ❌ <95% FAIL

เทียบกับเมื่อเช้า (2026-09-02 09:xx): `zones curl+jar 200 56KB 15 anchors 3/3 pass` → ตอนนี้ตกเป็น `403 418B 0/6` — แปลว่า **IP score บน booking.thaiticketmajor.com ตกถึงขั้น hard deny สำหรับทุก transport (curl/wreq/fetch) ภายใน 7 ชม.หลัง baseline 3480/h**

## วิเคราะห์

- `concert (www)` ยัง 100% ตลอด — ยืนยันกติกา A2-2 §3: `www` no-cookie ทนสุด ไม่ผูก session
- `booking.*` ตกพร้อมกันทั้ง 3 transports แม้ใช้ `curl/8.0.1 + full jar 4450 + Referer www` แบบที่เคยผ่าน — ไม่ใช่ jar หมดอายุอย่างเดียว (71B bounce) แต่เป็น `403 418B Access Denied` hard deny
- สาเหตุตรงกับ baseline A2-2: เปิด dashboard + watch + probe รัวหลายร้อยครั้งวันนี้ (Scenario C 3480/h 58× safe budget) ทำให้ Akamai IP score สะสมจน booking host ขึ้น `403` เต็ม
- Jar อายุ ~7 ชม. (login 02:43 → 15:33) น่าจะหมดอายุแล้วด้วย — แต่ต่อให้ refresh jar ใหม่ก็ยัง 403 อยู่ดีในตอนนี้ เพราะ IP ถูก flag แล้ว ต้อง **cooling 30 นาที** ตาม backoff table A2-2 §4 ก่อน

## สิ่งที่ทำแล้วในโค้ด

- `scripts/a2-3-24h-probe.ts` สร้างแล้ว: `concert 10m / zones 15m / fixed 30m (±20% jitter) total ~12/h ~288/24h` + `--once` สำหรับ verify เร็ว, JSONL `{ts, endpoint, query, status, bytes, ms, ok, detail}`
- `watch-manager.ts` เติม backoff `30→60→120→300→600s + circuit-open 8 fail + degraded pill` + `BOT_BUDCON_WATCH_MS=15000` ลด load -88.6% แล้ว
- hygiene `www 0 cookie` ใช้ทุก transport แล้ว

## Next (ให้ผ่าน ≥95% ต้องทำ)

1. **Cooling 30 นาทีทันที** — หยุดทุก booking request (probe/watch/book) ทั้งหมด 30 นาที ให้ IP score ฟื้น (ตาม circuit-open rule)
2. หลัง 30 นาทีค่อย `POST /api/login/start` แบบ invisible เพื่อ refresh `PHPSESSID/_abck/bm_sv` ใหม่ แล้วค่อย `curl zones?query=504` แบบเดี่ยวๆ 1 ครั้งวัดว่า 200 กลับไหม
3. ถ้า 200 กลับ → เริ่ม A2-3 24h loop จริงด้วย rate ใหม่ `12/h` (ไม่ใช่ 3480/h เดิม) พร้อม jitter และ backoff — จะผ่าน ≥95% ได้
4. ถ้ายัง 403 → ต้องรอ 60-120 นาที หรือเปลี่ยน IP (แต่ Q4=B ห้าม — ต้องรอเท่านั้น)

## หลักฐานไฟล์

- `scripts/a2-3-24h-probe.ts` (probe loop + --once)
- `.wayfinder/reports/a2-3-probe.jsonl` (10 entries 2 รอบ)
- `scripts/a2-1-curl-booking-probe.ts` re-run ก็ `zones 403` เหมือนกัน — ยืนยันไม่ใช่บั๊ก probe แต่เป็น IP deny จริง

> หมายเหตุ: รายงานนี้เป็น initial run — 24h เต็มต้องรอ cooling แล้วรัน `npx tsx scripts/a2-3-24h-probe.ts --duration 24h` ต่อ จึงจะได้ `≥95%/24h` ตาม Destination
