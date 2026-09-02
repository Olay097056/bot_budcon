# On-sale Day Playbook — วัน D ไม่มี deny (A2-4)

**Ticket**: `04-onsale-playbook.md` · **Depends**: A2-1 (curl booking ✅) + A2-2 (hygiene) + A2-3 (initial degraded — ยังรอ 24h/cooling)
**ใช้เมื่อ**: วันเปิดขายจริง (on-sale window) — traffic TTM พุ่ง Akamai เข้มสุด
**หลักการ**: ฟรี 100% (Q3=A), IP เดียว (Q4=B), bot-only (Q1=A) — ห้ามเพิ่ม load เกิน safe budget

---

## 1) Pre-flight checklist (ทำก่อนวัน D 60 นาที)

| # | เช็ค | วิธี | ผ่านคือ |
|---|------|------|---------|
| 1 | Cookies สด < 2 ชม. | `GET /api/auth/status` → `pill ok` + `expiresInSec` ไม่ null · ถ้า `expiring` หรือ `accept false` → `POST /api/login/start` (BOT_BUDCON_HEADLESS=0 ต้องมีคนกด captcha) | `accept true, pill ok` |
| 2 | Jar ฝั่ง booking | `npx tsx scripts/a2-1-curl-booking-probe.ts` ต้อง `zones 200 hasK true anchors>0` 1 ครั้ง (ไม่ต้องยิงซ้ำ) | 200 53KB+ |
| 3 | Concert ยัง 200 | `curl -A curl/8.0.1 https://www.thaiticketmajor.com/concert/` ต้อง `200 120KB+ hits>=15` | 200 |
| 4 | Cache อุ่น | `GET /api/events/discover?limit=12` → `events 12` + `with zones >=6` (ถ้าได้น้อยแต่ไม่ 0 ก็อุ่นพอ) | ≥6 |
| 5 | Watcher พร้อม | `GET /api/status` → `sensorReady true, chromeAlive true` | true |
| 6 | Probe ล่าสุด | ดู `.wayfinder/reports/a2-3-probe.jsonl` ล่าสุด 1 ชม. ต้อง `concert ≥95% / zones ≥80%` | pass |
| 7 | อัปเดตที่ใช้ | `run_here.bat` 1 คลิก → `http://localhost:7890` เปิดได้, `ui limit 12 + 5m jitter + watch 15s + backoff` ติดแล้ว | — |

ถ้าข้อ 2/3 ตก → ยังไม่เข้า Silence window ให้ **รอ cooling 30 นาที** ก่อน (อย่ายิงซ้ำ)

## 2) Silence window — 30 นาทีก่อนเปิดขาย

หยุดทุกอย่าง 30 นาทีก่อนเวลาเปิดขาย (on-sale time -30m):
- ปิด `watch` ทั้งหมด (`POST /api/watch/stop`)
- ห้ามกด `↻ รีเฟรช` / `preview` / `a2-3 probe` ใดๆ
- ปล่อยให้ IP score ฟื้น (Akamai decay) — จาก evidence 2026-09-02: ยิง 3480/h ทำให้ booking 403 เต็มภายใน 7 ชม., cooling 30m ตาม backoff table คือขั้นต่ำที่จะกลับมา 200 ได้

ตั้งนาฬิกา: `on-sale -30m → silence, -5m → arm, 0m → burst`

## 3) Book sequence วัน D (ลำดับ transport)

ใช้ **curl-first** ตาม A2-1 ที่พิสูจน์แล้วว่า `curl/8.0.1 + full jar 4450 + Referer zones?query` ผ่านถึง `validateseat {"result":true}` ได้โดยไม่ต้องเปิด browser

```
1. ได้สัญญาณโซนใหม่ (watch NEW หรือคนกดดู discover แล้วเห็นโซน)
2. curl zones.php?query=<q> → ตรวจ hasK + anchors (1 req, ~500ms)
3. curl fixed.php?k=&zone=<code>&round=<rdId> + Referer zones?query → ตรวจ id="tableseats" + seatuncheck>0 (1 req)
4. curl validateseat.php POST + X-Requested-With: XMLHttpRequest + chkSeats[]=ROW-XX-P*price (1 req)
   → ถ้า {"result":true} แปลว่า hid-checkseat สร้างแล้ว = ที่นั่งล็อก
5. bookingseats.php POST + form submit → ไป paymentall.php (humanStep — เปิด Firefox ให้คนทำ captcha + 3-D Secure เอง)
```

**ห้าม**ใช้ `Mozilla/5.0 Firefox UA` บน curl — A2-1 พิสูจน์แล้วว่า `Firefox UA + cookie → 403` ทันที แต่ `curl/8.0.1 → 200`

ถ้า watch เปิด `autoBook` ไว้: watch จะยิง `onNewZone → BotEngine book` เองด้วย browser path (fallback) แต่ curl-first ใน `ttm-fetch.ts` จะลอง `curl` ก่อนเสมอ → ถ้า curl ผ่านจะไม่แตะ browser เลย

## 4) Fallback ladder — ถ้า curl เริ่ม 403 กลางวัน D

| ขั้น | สัญญาณ | ทำอะไร | รอเท่าไหร่ |
|------|---------|--------|------------|
| 1 | curl zones 403 1 ครั้ง | ไม่ยิงซ้ำทันที — นับ `consecFail` | backoff 30s (jitter) |
| 2 | 403 ครั้งที่ 2 | หยุดส่ง browser fallback 1 รอบ | backoff 60s |
| 3 | 403 ครั้งที่ 3 | `watch degraded` (amber pill) | backoff 120s |
| 4 | 403 ครั้งที่ 4 | `watchDetail` ขึ้น cooling | backoff 300s (5m) |
| 5 | 403 ครั้งที่ 5+ | `circuit open` — `watch active false` ต้องกด `เริ่มเฝ้ารอ` ใหม่เอง | 600s (10m) max |
| 6 | 403 ต่อเนื่อง 10 นาที หรือ `consecFail ≥8` | **หยุดทั้งวัน** — `circuit open — IP cooling 30m` (log) ตั้ง timer 30 นาทีค่อยกด start ใหม่ได้ | 30m hard cooling |

ระหว่าง cooling: ใช้ `cache/discover-cache.json` (12 events) + `concert` no-cookie (ยัง 100%) ดู title ไปก่อน อย่าแตะ booking

## 5) Recovery — ถ้าโดน deny ยาวทั้งวัน D

- ยอมรับว่า Q3=A ห้ามจ่าย proxy/residential IP — ไม่มีทางลัดเสียเงิน
- ทางเดียวคือ **รอ + ลด load**: ปิดทุก tab/dashboard เหลือเครื่องเดียว, `BOT_BUDCON_WATCH_MS=60000` (strict 60/h) + `discover 10m` (78/h) รวม `~138/h` ปลอดภัยสุดตาม tier `IDLE` ใน A2-2 §4.3
- ทุก 30 นาทีลอง `curl concert` 1 ครั้ง + `curl zones?query=504` 1 ครั้ง (2 req/30m) เพื่อวัดว่า IP กลับมาไหม — ถ้า `200` กลับค่อย burst ต่อ
- ถ้ายัง 403 เกิน 2 ชม. → แปลว่า IP ถูก flag ยาว ให้เลื่อนการจองไปรอบถัดไป / ใช้เครื่องอื่นเปิด TTM แบบ manual (ยอมรับว่า bot วันนั้นพัก — Q1=A bot-only แต่คนจองมือได้)

## 6) คำสั่ง operator วัน D (copy-paste)

```bat
REM 1) เช็คก่อน 60 นาที
curl http://localhost:7890/api/auth/status
npx tsx scripts/a2-3-24h-probe.ts --once
curl "http://localhost:7890/api/events/discover?limit=12"

REM 2) silence 30m (ทำ -30m)
curl -X POST http://localhost:7890/api/watch/stop

REM 3) arm -5m
curl -X POST http://localhost:7890/api/watch/start -H "Content-Type: application/json" -d "{\"url\":\"https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504\",\"autoBook\":true,\"quantity\":1}"

REM 4) ถ้า circuit open
curl http://localhost:7890/api/watch/status   # ดู consecFail / circuitOpen / degraded
# รอ 30m แล้วค่อย POST /api/watch/start ใหม่

REM 5) ตรวจ IP ฟื้นทุก 30m
npx tsx scripts/a2-3-24h-probe.ts --once
```

## 7) Tier แนะนำตามโหมด (จาก A2-2)

```
IDLE (ไม่มีขายใกล้ๆ):  watch 30s (120/h), discover 10m (78/h) → ~198/h  ปลอดภัยสุด
ARMED (ก่อน on-sale 60m): watch 15s (240/h), discover 5m (156/h) → 396/h
BURST (on-sale 30m):  watch 10s (360/h), discover pause (ใช้ cache) → 360/h
  หลัง burst → กลับ IDLE + cooling 10m
STRICT_60 (เมื่อ IP เพิ่งโดน 403): watch 60s (60/h), discover 10m (78/h) → 138/h
```

---
*Playbook นี้อิงหลักฐาน `A2-1 curl 200 vs Firefox 403`, `A2-2 baseline 3480→396/h + backoff`, `A2-3 initial 0% zones 403` — ต้องทำ cooling 30m แล้วค่อยรัน 24h probe จริงให้ผ่าน ≥95% จึงจะถือว่า Destination เสร็จ*
