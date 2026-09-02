# A2-2 — IP hygiene: baseline / threshold / cookie / backoff / interval (สรุปวิจัย)

**Ticket**: `02-ip-hygiene.md` · **Lab**: `A2` Akamai round-2
**Repo**: `C:/Users/bit-it.helpdesk/Desktop/claude/_active/bot_budcon`
**วันที่**: 2026-09-02 · **เงื่อนไข**: ไม่มี IP สำรอง (Q4=B), ฟรี 100% (Q3=A), ห้ามยิงทดสอบ >60/ชม./endpoint

---

## 1) Baseline — ปัจจุบันระบบยิงเท่าไหร่จริง

### 1.1 แหล่ง request ที่นับได้ (code-evidence)

| แหล่ง | โค้ดอ้างอิง | สูตรต่อครั้ง | rate ปัจจุบัน (default) | หมายเหตุ |
|---|---|---|---|---|
| **watch poll** | `src/watch-manager.ts:138` `intervalMs ?? 5000` | 1 × `GET zones.php?query=<q>` ผ่าน `hardenedFetcher` | `5000ms → 3600/5 = 720 req/h` ต่อ 1 watch ที่ active | chain `curl→wreq→fetch→browser` แต่ปกติ curl สำเร็จ → นับ 1 |
| **discover** | `src/discover.ts:58-215` `1 + limit` | `1 × GET concert/` + `N × GET zones.php?query` (N = unique queries พบ, capped ที่ `limit`) | `limit=30` ตอน UI `→ 1+~22 = 23 req/รอบ` · empirical 2026-09-01 `concert 124KB 22 queries` | `limit=12` ตอน server warm-up `→ 1+12 = 13 req` |
| **UI auto-discover** | `ui/index.html:866` `setInterval(doDiscover,30000)` | ทุก 30s ยิง `GET /api/events/discover?limit=30` → server ทำ discover 23 req | `3600/30 = 120 รอบ/ชม. × 23 = 2,760 req/h` (concert 120/h + zones 2,640/h) เมื่อเปิด tab ค้าง | dominant load — ไม่เคย backoff |
| **server warm-up** | `src/server.ts:466` `discoverEvents({limit:12})` | 1 ครั้งตอน boot `1+12 = 13 req` | 13 req / boot (burst 1 ครั้ง) | + `seedLocalCacheFromRepo()` ไม่ยิงเน็ต |
| **book flow** | `src/book.ts:85-268` | `zones→round_change→fixed.php→validateseat→confirm→payment` = 4–6 document loads + AJAX | `~5 req/ครั้ง` (browser) | เกิดเฉพาะเมื่อ watch เจอ zone ใหม่ + autoBook |
| **preview** | `src/server.ts:385` `POST /api/events/preview` | `1 × zones.php` | น้อย (manual) | ไม่นับใน baseline ต่อเนื่อง |

> `hardenedFetcher` (`src/ttm-fetch.ts:167`) chain 4 transports worst-case คูณ 4 ถ้า curl โดน soft-block แต่เมื่อ curl hygiene ถูกต้อง (ดู §3) จะจบที่ `curl` ครั้งเดียว → ตัวเลข baseline บนใช้กรณีดี

### 1.2 สูตรรวม

```
R_total/h = R_watch + R_discover_UI + R_preview + R_book + R_warmup/ชม.

R_watch      = 3600 / intervalMs_watch      (1 req/poll)
R_discover   = (3600 / intervalMs_discover) × (1 + min(limit, queries_on_page))
             เช่น concert 30s + limit30 + 22 queries = 120×23
```

### 1.3 Scenario — ตัวเลขจริง (คำนวณ)

| Scenario | watch | UI tabs | discover | watch req/h | discover req/h | **รวม req/h** | ต่อวัน (24h) | เทียบ 60/h limit* |
|---|---|---|---|---|---|---|---|---|
| **A: idle, ไม่เปิด UI, watch ปิด** | off | 0 | แค่ warm-up 1 ครั้ง | 0 | ~0.5 (13/boot/24) | **~0.5** | 13 | ✅ |
| **B: เฝ้าปกติ ไม่มี UI** | 1 zone, 5s | 0 | ไม่มี | 720 | 0 | **720** | 17,280 | 🔴 12× |
| **C: เฝ้าปกติ + เปิด UI 1 tab** (สภาพ demo วันนี้) | 1 zone, 5s | 1 | 30s/23req | 720 | 2,760 | **3,480** | 83,520 | 🔴 58× |
| **D: เฝ้า + UI 2 tabs** (user เปิด 2 เครื่อง) | 1 zone, 5s | 2 | 30s×2 | 720 | 5,520 | **6,240** | 149,760 | 🔴 104× |
| **E: วัน on-sale burst (watch+book 2 ครั้ง/ชม.)** | 1 zone, 5s | 1 | 30s | 720 | 2,760 | **3,490** (+book 10) | — | 🔴 |

* `60/ชม./endpoint` = เพดานทดสอบที่ ticket กำหนด; ใช้เป็น reference “จะเริ่มเสี่ยง” ไม่ใช่ hard Akamai limit แต่ตัวเลขปัจจุบันเกิน 1–2 order of magnitude

**แยกต่อ endpoint (Scenario C):**

| Endpoint | req/h | % ของรวม | ประเมินความเสี่ยง |
|---|---|---|---|
| `www.thaiticketmajor.com/concert/` | 120 | 3.4% | เกิน 60/h 2× — เสี่ยงปานกลาง (แต่ curl no-cookie ทนกว่า) |
| `booking.thaiticketmajor.com/.../zones.php` (watch 720 + discover 2,640) | **3,360** | 96.6% | เกิน 60/h 56× — **dominant & อันตรายสุด** |

**Single-IP burst rate:** Scenario C = `3,480/3600 ≈ 0.97 req/s` เฉลี่ย; ถ้า chain fallback เป็น browser (1.5s wait/cycle ใน `discover.ts:171` + `ttm-fetch.ts:150`) latency จะบังไม่ให้เร็วกว่านี้ แต่ยังส่งสัญญาณถี่ — Akamai IP score มอง “pattern สม่ำเสมอถี่” เป็น bot

**สรุป baseline:**

- ตัวทำให้ IP ตกเร็วสุดคือ **UI auto-discover ทุก 30s × 23 req** ไม่ใช่ watch — เปิด dashboard ค้าง 1 ชม. = 2,760 req เพิ่มโดยไม่รู้ตัว
- watch 5s ก็เกิน safe budget ไป 12 เท่าแล้ว — ถึงปิด UI ยังไม่ปลอดภัย
- book ไม่ใช่ปัญหาเชิงปริมาณ (5 req/ครั้ง เกิดน้อย) แต่เป็นปัญหาเชิง fingerprint (browser 100% deny ตาม map 2026-09-02)

---

## 2) Threshold — ยิงเท่าไหร่ถึงเริ่มโดน deny

### 2.1 สิ่งที่รู้แล้วจากหลักฐาน (ไม่ต้องยิงเพิ่ม)

| ปัจจัย | สิ่งที่วัดได้ | ความหมายต่อ threshold |
|---|---|---|
| curl no-header `GET concert/` 3/3 pass (124KB) ทุกครั้งที่ลอง | `scripts/stability-probe.ts:21-30` | concert ทนสุดเมื่อ **ไม่มี cookie** — threshold สูงกว่า 60/h แบบชัดเจน |
| curl + auth jar `GET zones.php?query=504` 2–3/3 pass (56KB 15 anchors) | เดียวกัน + `src/ttm-curl.ts:4-18` matrix | zones ต้องมี jar → curl ก็รอด; แสดงว่า IP ยังไม่ถูก ban เด็ดขาด เป็น **scoring** |
| wreq/fetch/browser → 403/407 100% บน IP เดียวกันชั่วโมงเดียวกัน | `map-akamai2.md:14` “Firefox จริง + playwright ทุก profile โดน deny แต่ curl ผ่าน 100%” | **threshold ขึ้นกับ fingerprint ไม่ใช่แค่จำนวน** — browser TLS/JA3 + sensor path ถูก penalize หนักกว่า curl |
| เหตุการณ์ 2026-09-02 Firefox จริงโดน `Reference #18.9cd...` | Hypothesis ใน ticket | “ยิงเทสหลายร้อยครั้ง (curl+wreq+fetch+browser ผสม + retry รัวๆ)” ทำให้ **IP score ตกแบบสะสม** ไม่ใช่ block ทันที |

→ สรุป: **ไม่มี threshold เดียว** แยกตาม transport/endpoint:

| Cohort | safe budget โดยประมาณ (ต้องพิสูจน์ตาม §2.2) | tolerance สูงเพราะ |
|---|---|---|
| `curl → concert/ (no-cookie)` | ~60–120/h ต่อ IP ได้สบาย | ไม่มี session, Akamai มองเป็น crawler ปกติ |
| `curl → zones.php (+jar)` | ~60–180/h ต่อ IP (ถ้าห่างพอ) | Session valid + Referer ถูก, ไม่รัน JS |
| `wreq/fetch → ใดๆ` | ~20–40/h แล้วเริ่ม 403 | JA3 ไม่ตรง / ไม่มี sensor |
| `browser (Playwright)` | ~10–20 navigations/h | หนักสุด โดนตรวจ fingerprint + ต้องมี sensor_data |

ตัวเลข “60/ชม./endpoint” ที่ ticket ห้ามเกินจึงเป็นเพดานทดสอบที่ **conservative + ปลอดภัย** — ไม่ได้หมายความว่า Akamai block ที่ 61; แต่ถ้าเราวางระบบให้ ≤60 ทุก cohort ก็จะอยู่ห่างจากเขตอันตรายพอ

### 2.2 แผนวัด threshold แบบคุมตัวแปร (ไม่รุนแรง, ≤60/ชม.)

> ห้ามยิงเกิน 60/ชม./endpoint ตามโจทย์ — ใช้ dose-escalation + วัด deny%

**Design:**

```
แต่ละ cohort (A/B/C) ยิงคนละชั่วโมง ไม่ชนกัน, พัก 30 นาทีระหว่าง cohort
A: curl concert/ no-cookie
B: curl zones.php?query=650 with jar (query cache มี zones 15 ตัว)
C: browser zones.php (ถ้าจำเป็น วัดน้อย)

dose: 10 → 20 → 40 → 60 /ชม.  (step ละ 60 นาที, uniform spacing + jitter)
metric ต่อชั่วโมง: { pass, softBlock(71B/signin), hardDeny(403/429), latency p50/p95 }
stop rule: ถ้า deny% >5% ที่ dose ใด → หยุดเพิ่ม dose ของ cohort นั้นทันที
```

**ตาราง spacing + jitter:**

| Dose | interval เฉลี่ย | jitter | ตัวอย่าง schedule |
|---|---|---|---|
| 10/h | 360s (6m) | ±20% (288–432s) | 0:00, 0:06, 0:12, … |
| 20/h | 180s (3m) | ±20% |  |
| 40/h | 90s | ±20% (72–108s) |  |
| 60/h | 60s | ±20% (48–72s) | เพดานสูงสุดที่ ticket อนุญาต |

**วัด IP score decay:** หลังแต่ละชั่วโมง ดู `denied` ของ `curl concert/` 3 ครั้งแบบ probe (script เดิม) — ถ้า deny% ของ curl เพิ่ม แปลว่า IP score ตกแบบ global ไม่ใช่แค่ cohort

**Deliverable ของ A2-3 (24h probe)** จะใช้ dose ที่ปลอดภัยที่สุดจากผลนี้ (คาดว่า 20–40/h สำหรับ zones curl)

---

## 3) Cookie hygiene — concert no-cookie vs zones auth-jar

### 3.1 Matrix ที่พิสูจน์แล้ว (code + empirical)

`src/ttm-curl.ts:34-52` อธิบายกติกาไว้แล้ว + ยืนยันด้วย `scripts/stability-probe.ts`:

| Endpoint | ส่งอะไร | ผล | เหตุผล |
|---|---|---|---|
| `GET https://www.thaiticketmajor.com/concert/` | **curl + ไม่มี Cookie/Refererเลย** | ✅ 200 124KB 22 queries (3/3) | เป็น public page — Akamai rule เห็น Cookie บน GET public เป็น mismatch → 403 |
| `GET https://www.thaiticketmajor.com/concert/` | curl + `Cookie: auth jar` | ❌ 403 Access Denied | jar มี `.thaiticketmajor.com` ส่งไป www → ถูก flag |
| `GET https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504` | curl + `Cookie: auth jar` + `Referer` | ✅ 200 56KB 15 anchors (2/3) | Auth-scoped host ต้องมี session (`PHPSESSID` + `ttkname` + `_abck`/`bm_sv`) |
| `GET .../zones.php` | curl ไม่มี cookie | ❌ 71B `meta refresh → /user/signin.php` | Session ไม่ถูกยอมรับ (soft-block) |
| `GET .../zones.php` | wreq/fetch ไม่มี/มี jar แต่ JA3 ไม่ตรง | ❌ 71B bounce หรือ 403 | TLS fingerprint ไม่ผ่าน |

**กติกา domain scoping** ที่ถูกแล้ว (`src/cookies.ts:73-96`, `src/ttm-curl.ts:34-37`):

```
isAuthScoped(url) = host ∈ { booking.*, event.* } → ส่ง jar
public host (www.*) → ส่ง "" (strip หมด)
```

ห้ามส่ง `Cookie` + `Referer` แบบเหมาเข่งทุก request — `hardenedFetcher` เดิมเคยทำ (ดู `src/ttm-fetch.ts:97-105` ส่ง Cookie ทุก host) ซึ่งเป็นสาเหตุที่ concert 403 ใน chain เก่า

### 3.2 ส่ง cookie ถี่ๆ ทำให้ session โดน flag ไหม?

**คำตอบ: มีผล แต่ไม่ใช่เพราะ “จำนวนครั้ง” อย่างเดียว**

1. **Reuse เดิมซ้ำๆ โดยไม่ refresh:** Akamai `_abck` มีอายุสั้น (หลักนาที–ชม.) และผูกกับ `sensor_data` ที่ browser สร้างจาก mouse/ timing; curl ที่ reuse `_abck` เดิม 720 ครั้ง/ชม. โดยไม่รัน JS → Akamai มองว่า “cookie ขโมยมา replay” หลังอายุหมด → 403 เพิ่ม
2. **Cross-host leakage:** ส่ง `bm_sv`/`_abck` ไป `www.*` (public) ทำให้ Akamai เห็น inconsistency (cookie ที่ควรอยู่ booking ปรากฏบน www) → score ตก
3. **Noisy rotation:** ถ้า `loadCookies()` แล้วส่ง `Cookie: a=1; b=2; bm_sv=...; _abck=...` ถี่ๆ แต่ `cookies.json` ไม่เคยถูก refresh ผ่าน browser → stale jar ถูก replay จนโดน flag

**แนวป้องกัน:**

- **Split hygiene ตาม host** (ทำแล้วใน `ttm-curl.ts` ต้องบังคับใช้ทุก path): public = 0 cookie, auth = full jar + `Referer: https://www.thaiticketmajor.com/` (zones ต้องมี Referer ตาม `ttm-fetch.ts:54`)
- **Refresh jar เป็นรอบ:** ทุก 2–4 ชม. หรือเมื่อเจอ soft-block 2 ครั้งติด → trigger invisible `BotEngine.getContext().addCookies(loadCookies())` + เปิดหน้า `signin.php` เงียบๆ เพื่อต่ออายุ `_abck` (ticket 14 ทำแล้วบางส่วน) — ไม่ต้อง login ใหม่ถ้า `gate()` ยัง accept
- **อย่า hammer ด้วย jar เดิมหลัง deny:** เมื่อ `isSoftBlocked()` = true (403/429/71B bounce) → หยุดส่ง jar เดิมซ้ำทันที เข้า backoff (§4) ก่อน มิฉะนั้น replay จะยิ่งลด score

---

## 4) Backoff policy + Watch interval ใหม่ที่ปลอดภัย

### 4.1 ปัญหาของปัจจุบัน (fog)

`src/watch-manager.ts:179-252` `runLoop`:

```ts
if (!ok) { log(`http ${status} — retry`); await sleep(intervalMs); continue; }
// catch → sleep(intervalMs); continue
// ไม่เคยเพิ่ม interval, ไม่เคยหยุด, ไม่ jitter, ไม่นับ consecutive
```

ผล: ถ้า Akamai เริ่ม 403 ที่ poll #N ระบบจะยิง 403 ต่อเนื่อง `720 ครั้ง/ชม.` จน IP score ตกถาวร

`src/discover.ts:181-192` `fetchWithBrowserFallback` ก็ retry 403 ด้วย browser ทันที → เพิ่ม fingerprint ที่โดน penalize อยู่แล้ว

### 4.2 Backoff ที่เสนอ (ใช้ได้ทั้ง watch + discover + ttmFetch)

**State:** `consecutiveFailures` (นับ 403/429/503/71B bounce), `consecutiveSuccesses`, `currentBackoffMs`

| consecutiveFailures | backoff ก่อน poll ถัดไป | jitter | action |
|---|---|---|---|
| 0 | `intervalMs` ปกติ | ±15% | ปกติ |
| 1 | `30s` | ±20% | log warn |
| 2 | `60s` | ±20% | + หยุดส่ง browser fallback 1 รอบ |
| 3 | `120s` | ±20% |  |
| 4 | `300s` (5m) | ±20% | แจ้ง UI pill = degraded |
| ≥5 | `600s` (10m) max | ±20% | **circuit-open:** หยุด watch auto, ต้องกด resume เอง |

**Reset:** `consecutiveSuccesses ≥ 5` ครั้งติด → `consecutiveFailures = 0`, `currentBackoffMs = intervalMs`

**Hard stop:** ถ้า `consecutiveFailures ≥ 8` หรือ `403 ต่อเนื่อง 10 นาที` → `WatchManager.stop()` + log `circuit open — IP cooling 30m` + ตั้ง timer 30 นาทีค่อยให้ start ใหม่ได้

**Jitter สูตร:** `delay = base * (0.85 + 0.30*rand())` ป้องกัน thundering herd เมื่อหลาย tab

**Soft-block vs hard-deny:**

- `71B signin bounce` (`body.length<400 && /signin\.php/`) → นับเป็น `softFail` (ไม่เพิ่ม backoff เท่า 403 แต่ trigger jar refresh)
- `403/429/503` หรือ `body includes Access Denied / Reference #` → `hardFail` → เข้าตาราง backoff ทันที

**Integration points (patch แนะนำ):**

```ts
// src/watch-manager.ts — เพิ่ม field
private _consecFail = 0; private _consecOk = 0;

// ใน runLoop หลัง fetch:
if (!ok || isSoftBlocked({status, body})) {
  const isHard = status===403||status===429||status===503||body.includes('Access Denied');
  this._consecFail++; this._consecOk=0;
  const backoff = backoffFor(this._consecFail, intervalMs); // ตารางบน
  this._log(`watch backoff ${backoff}ms (fail#${this._consecFail} ${isHard?'hard':'soft'})`);
  if (this._consecFail >= 5) this._log('watch degraded — IP cooling');
  if (this._consecFail >= 8) { this._active=false; this._log('circuit open'); return; }
  await sleep(backoff); continue;
} else {
  this._consecOk++; if (this._consecOk>=5) this._consecFail=0;
}
```

```ts
// src/ttm-fetch.ts isSoftBlocked() ใช้เป็นตัวตัดสิน hard/soft แล้ว
// เพิ่ม export backoffFor() ให้ watch/discover เรียก
```

### 4.3 Watch interval ใหม่ที่ปลอดภัย

**หลักการ:** แยก “เฝ้าเงียบ” vs “เฝ้าใกล้ขาย” และฆ่า discover auto ที่เป็นตัวการ

| พารามิเตอร์ | ค่าปัจจุบัน | ค่าที่เสนอ (safe default) | เหตุผล + ตัวเลขใหม่ |
|---|---|---|---|
| `watch intervalMs` | `5000ms` (720/h) | **`15000ms` (240/h) default** · burst ได้ `10000ms` (360/h) เมื่อ on-sale window | 240/h ยังเกิน 60/h แต่ทนได้เพราะ curl+jar hygiene ดี; ถ้าต้อง ≤60 จริงให้ใช้ `60000ms` (60/h) แต่จะช้า 1 นาที — เสนอ 15s เป็น compromise + backoff จะคุมต่อ |
| `watch intervalMs (strict mode)` env `BOT_BUDCON_WATCH_MS` | ไม่มี | `60000ms` เมื่อต้องการผ่านเกณฑ์ 60/h เข้ม | 1 poll/นาที = 60/h พอดี |
| `UI auto-discover` | `30s × 23 req = 2,760/h` | **`300s (5m) × 13 req = 156/h`** หรือ **ปิด auto แล้วกดปุ่ม refresh เอง** | ลด 17.7×; ใช้ `limit 12` ไม่ใช่ 30 (cache มี 12 events ก็พอ) |
| `discover limit` | 30 (UI) / 12 (warm-up) | **`12` ทุกที่** | `cache/discover-cache.json` ปัจจุบันมี 12 events พอดี — 30 ไม่ได้เพิ่ม coverage แต่เพิ่ม 2× load |
| `discover jitter` | ไม่มี | `±20%` | กันทุก tab ยิงพร้อมกัน |
| `preview` | ไม่จำกัด | rate-limit 1/30s ต่อ query | กัน spam ปุ่ม preview |

**Baseline ใหม่หลังแก้ (Scenario C 1 watch + 1 UI tab):**

|  | ก่อน | หลัง (15s watch + 5m discover/12) | ลดลง |
|---|---|---|---|
| watch | 720/h | **240/h** | −67% |
| discover (concert) | 120/h | **12/h** | −90% |
| discover (zones) | 2,640/h | **144/h** | −94.5% |
| **รวม** | **3,480/h** | **~396/h** | **−88.6%** |
| req/s เฉลี่ย | 0.97 | 0.11 |  |
| ต่อวัน | 83,520 | 9,504 |  |

ถ้าใช้ strict `60s watch` + `5m discover`:

| รวม | **216/h** (watch 60 + discover 156) | −93.8% | ผ่านเกณฑ์ 60/h แบบ “ต่อ endpoint” ได้พอดี (zones 60+144=204 ยังเกินนิด แต่แยก endpoint: zones watch 60/h ผ่าน, discover zones 144/h เกิน 2.4× — ยอมรับได้ถ้า discover ทุก 10m → 78/h) |

**Tier แนะนำตามโหมด:**

```
IDLE (ไม่มีขายใกล้ๆ):
  watch 30s (120/h), discover 10m (78/h) → รวม ~198/h  ปลอดภัยสุด

ARMED (ก่อน on-sale 60 นาที):
  watch 15s (240/h), discover 5m (156/h) → รวม 396/h

BURST (on-sale window 30 นาที):
  watch 10s (360/h), discover pause (ใช้ cache) → 360/h
  หลัง burst จบ → กลับ IDLE + cooling 10m
```

---

## 5) กฎ Cookie hygiene สรุป (checklist)

- [x] `src/ttm-curl.ts` ทำ `isAuthScoped()` แล้ว — ต้องบังคับให้ `src/ttm-fetch.ts` ทุก transport ก็ใช้กติกานี้ (ตอนนี้ `wreqTransport`/`nodeFetchTransport` ส่ง Cookie ทุก host — ต้องแก้)
- [ ] เพิ่ม `stripCookiesForPublicHosts(url)` helper แล้วเรียกก่อนสร้าง header ทุกครั้ง
- [ ] `concert/` ต้องไม่มี `Cookie` และไม่มี `Referer`/`Authorization` ใดๆ — `curl -A "curl/8.0.1"` พอ (ตาม matrix)
- [ ] `zones.php/fixed.php/bookingseats.php` ต้องมี `Cookie: <jar>` + `Referer: https://www.thaiticketmajor.com/` + `Accept-Language: th,en-US`
- [ ] Jar refresh ทุก 2–4 ชม. หรือเมื่อ `consecutiveFail 2` → เปิด browser hidden ไป `signin.php` เพื่อต่อ `_abck` แล้ว `saveCookies()`

---

## 6) สิ่งที่ต้องแก้ในโค้ด (ลำดับทำ)

1. **Kill auto-discover spam** — `ui/index.html:866` `30000 → 300000` (5m) + `limit 30 → 12` + เพิ่ม jitter
2. **Watch interval** — `src/watch-manager.ts:138` `5000 → 15000` + อ่าน `process.env.BOT_BUDCON_WATCH_MS` override + jitter
3. **Backoff** — เพิ่ม `consecutiveFail/backoffFor/circuitOpen` ใน `watch-manager.ts:runLoop` + `src/ttm-fetch.ts:isSoftBlocked` เป็นตัวตัดสิน
4. **Cookie hygiene** — แก้ `src/ttm-fetch.ts:76-105` ให้ strip cookie บน public hosts
5. **Discover hygiene** — `src/discover.ts:194` concert fetch ต้อง no-cookie แยกจาก zones fetch (jar)
6. **UI pill** — แสดง `consecutiveFail/backoff` ใน `GET /api/watch/status` ให้ user เห็นว่า cooling

---

## 7) ความเสี่ยงที่ยังเหลือ

- Browser path ยัง 100% deny — ถ้า A2-1 พิสูจน์ว่า curl-only booking ไม่ได้ (fixed/validateseat ต้อง browser) จะต้องแก้ threshold ของ browser โดยเฉพาะ (อาจต้อง proxy/residential IP — ขัด Q3=A)
- แม้ลดเหลือ 396/h ก็ยังเกิน 60/h ที่เข้มสุด — ถ้า Akamai ปรับ threshold ลงอีก ต้องมีโหมด `STRICT_60` (watch 60s + discover 10m)
- `_abck` rotation ต้องวัดจริงว่า Akamai ให้อายุกี่นาที — ถ้าสั้นกว่า 15m จะต้อง shorten watch interval ไม่ได้ ต้อง refresh บ่อยขึ้น

---

*รายงานนี้ใช้หลักฐานจากโค้ด + empirical 3/3 curl pass + map 2026-09-02 เท่านั้น ไม่มีการยิงทดสอบเพิ่มเกิน 60/ชม. — ตัวเลข threshold ที่เป็นช่วงต้องยืนยันด้วย dose-escalation probe ตาม §2.2 ก่อนล็อคค่า final*
