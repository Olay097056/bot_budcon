# T01 — Live TTM HTML probe — ผลยิงสด 2026-09-03 11:25 ICT

> Probe: `concert/` 1× (no-cookie, curl/8.0.1) + `zones.php?query=504,650,622` 3× (curl+jar+Referer booking via `loadCookies()` → `buildCookieHeader()`) + `fixed.php?k&zone=A1&round=81895` 1× (fallback cached k) — รวม 5 requests, ไม่ commit HTML เต็ม
> Raw snippets: `.wayfinder/references/T01-html-*.html` (<100KB, concert 80KB truncated)

## 1) สรุปสั้น (มีรูปให้ดึงสดไหม + ต้อง fallback อะไร)

- **Booking hard deny วันนี้ (2026-09-03):** `zones.php` และ `fixed.php` ทุก query ที่ยิงด้วย `curl/8.0.1 + jar([REDACTED]) + Referer:https://www.thaiticketmajor.com/` ได้ `403 Access Denied 414B` (fetch 416B) เดียวกันทั้ง 3 transports (`curl`, `node fetch/Firefox UA`, `wreq-js` ทดสอบเสริม 1 ครั้ง) — ไม่มี `<img usemap>` / `<area>` / `#tableseats` ให้ parse สดเลย
- **`concert/` ยัง 200 ปกติ:** `curl -A curl/8.0.1` แบบไม่ส่ง Cookie/Referer ได้ `200 114.9KB` พบ `zones.php?query=` 20 hits (เช่น 650, 524, 747, 597, 612, 927, 622, 504 …) — `discover` ยังดึงรายการ event ได้ แต่ลง `zones.php` ต่อไม่ได้
- **Cache heal ทำได้ครึ่งทาง:** `~/.bot-budcon-data/discover-cache.json` (local, `fetchedAtMs=2026-09-02T06:30:43.424Z`, อายุ ~21h, 1315m) มี 12 events, 8 รายการที่มี `zones[]/k/rounds[]` สมบูรณ์ (เช่น 650:15 zones, 622:13 zones, 747:45 zones, 504:15 zones) — `discover.ts:280` heal block สามารถเติม `zones/k/rounds` ที่ live 403 ให้ UI ไม่ว่างได้ แต่ **ยังไม่มี `hallImageUrl/areas/coords` ใน cache** (field ยังไม่เคยเก็บ) จึงไม่มีรูป hall ให้ heal ต้องรอ T03 เพิ่ม field แล้วรอบที่ live 200 ค่อยเติม

→ **T03 ต้องทำ:** เพิ่ม `parseHallImage()` + `parseAreas()` แบบ regex เดียวกับ `parseZones()` แล้วเติม `hallImageUrl` + `areas[]` ลง `DiscoveredEvent` + `mergeWithCache()` heal เดียวกับ `zones` (ดูรายละเอียดท้ายไฟล์)

---

## 2) `zones.php?query=<q>` — ยิง 3 แบบต่างกันอย่างไร

| Transport | URL | Status | Bytes | Evidence |
|---|---|---|---|---|
| `curl/8.0.1` no-cookie, no headers | `https://www.thaiticketmajor.com/concert/` | **200** | 114898 | `zones.php?query=` 20 hits, `<img usemap>` 0 (ถูกต้อง — concert เป็น listing ไม่มี hall map) |
| `curl/8.0.1` + `Cookie: [REDACTED]` + `Referer: https://www.thaiticketmajor.com/` + `Accept-Language: th` | `booking.../zones.php?query=504` | **403** | 414 | `Access Denied`, anchors 0, usemap 0, tableseats false |
| เดียวกัน `query=650` | 403 | 414 | เดียวกัน |
| เดียวกัน `query=622` | 403 | 414 | เดียวกัน |
| `curl+jar+Referer` (cached k) | `fixed.php?k=70ac2f…&zone=A1&round=81895` | 403 | 414 | `tableseats` false |
| `node fetch` + `Firefox 128 UA` + เดียวกัน jar | `zones.php?query=504` | 403 | 416 | `Access Denied` (พิสูจน์ว่าไม่ใช่แค่ curl UA — hard deny ที่ IP/cookie ระดับ edge) |

**สรุปตาม `src/ttm-curl.ts` กฎเดิม:**
- `www.*` public → ต้อง *ไม่ส่ง* Cookie/Referer (ส่งแล้วจะ 403) — วันนี้ยังจริง: concert 200 เมื่อไม่ส่งอะไรเลย
- `booking.*` auth-scoped → ต้องส่ง jar เต็ม (`PHPSESSID`, `_abck`, `bm_sv`, `ak_bmsc` … [REDACTED]) ถึงเคยได้ 200 56KB 15 anchors (2026-09-02 เช้า) — วันนี้ jar เดิมยังอยู่ (4650 chars, `_abck=true`, `PHPSESSID=true`, `expires 2026-12-10`) แต่ edge ตอบ 403 แทน 71B signin bounce → สันนิษฐาน Akamai IP reputation / cookie/IP mismatch deny (Reference #18.xxxxx) ไม่ใช่แค่ signin
- `wreq-js Chrome 149 JA3` ก็เคยแก้ 403 ได้บางวัน แต่วันนี้ไม่ได้ทดสอบเต็ม chain (ต้องรัน `hardenedFetcher` เต็ม); `fetch` ด้วย Firefox UA ก็ 403 แบบเดียวกัน จึงตีว่า **ทั้ง chain `curl→wreq→fetch→browser` จะถูก block หมดใน IP นี้จนกว่า heal/cache หรือรอ cooldown** — ตรงกับ `tickets/A2-3` เคยสรุป `zones 0/15 403 but discover healed 6/12 from cache`

### 403 body sample (414B, ไม่มี HTML อื่น)

```html
<HTML><HEAD>
<TITLE>Access Denied</TITLE>
</HEAD><BODY>
<H1>Access Denied</H1>
You don't have permission to access "http&#58;&#47;&#47;booking&#46;thaiticketmajor&#46;com&#47;booking&#47;3m&#47;zones&#46;php&#63;" on this server.<P>
Reference&#32;&#35;18&#46;10ef2117&#46;1788409735&#46;9aa4cf5 <P>
</BODY></HTML>
```

- ขนาดสลับ 414B (curl) / 416B (fetch) — ใกล้ 418B ที่ ticket เขียน (ต่างกันแค่ Reference ID)
- ไม่มี `waf-verify`, ไม่มี `Reference` แบบ WAF challenge, ไม่มี meta-refresh `url=/user/signin.php` 71B — เป็น **hard deny** ระดับ edgesuite ไม่ใช่ soft redirect
- `fixed.php` 403 body รูปเดียวกัน แค่ path เป็น `fixed.php?`

---

## 3) Hall image + `<area coords>` — มีอะไรให้ดึงสดบ้าง (สด vs ประวัติ)

> **สดวันนี้ (403):** ทุก `zones.php` ได้ 414B เท่านั้น — ไม่มี `<img>`, `<map>`, `<area>`, `coords`, `shape` ให้ parse เลย → `parseHallImage(): withMapCount 0, areas 0` ทั้ง 3 queries

**ประวัติ / ความคาดหมายเมื่อ live 200 (ฐานสำหรับ T03):**

อ้างอิงจาก `src/book.ts:119` comment + `src/discover.ts` + ช่วงที่เคย live 200 56KB 15 anchors (2026-09-01~02) และ `src/zones.test.ts` pattern:

- **Selector เสถียร:** `img[usemap]` เดียวในหน้า (ขนาด 590×530 ตาม comment) — ไม่ใช่ `img[src*="seat"]` หรือ canvas/svg (ตอบข้อ 4 ด้านล่าง)
- **src เป็น absolute/relative:** ประวัติ TTM ใช้ `src="/booking/3m/upload/…"` หรือ `src="https://booking.thaiticketmajor.com/booking/3m/…jpg"` — ต้อง normalize ด้วย `new URL(src, "https://booking.thaiticketmajor.com")` ให้เป็น absolute เสมอ (เช่นเดียวกับที่ `discover.ts` ทำกับ `zonesUrl`)
- **ขนาดรูป:** ไม่ปรากฏใน probe 403 แต่ comment บอก 590×530 (CSS อาจ scale) — T03 ควรอ่าน `width/height` ถ้ามี แต่ไม่บังคับ
- **`<map name>` + `<area>`:** `<map name="MapZone">` (ชื่ออาจสุ่ม เช่น `Map`, `MapZone`) + `<area href="#fixed.php#A1" shape="poly" coords="x1,y1,x2,y2,…" alt="A1">` ครบทุก zone — จำนวน `<area>` ควร `== zones.length` (เช่น 504:15 areas, 650:15, 622:13) ถ้าไม่เท่าต้อง warn
- **`shape`:** `poly` เป็นหลัก (บาง hall ใช้ `rect`/`circle` ได้) — ต้องเก็บ `shape` ไว้ด้วยเพื่อให้ frontend คำนวณ hit-test ถูก
- **`coords`:** สตริงเลข `x,y` สลับกัน เช่น `120,80,180,90,175,140,115,135` (6–10 จุดต่อ poly) — ต้อง `split(',').map(Number)` แล้วหาร scale ตาม `naturalWidth/590` ถ้ารูปถูกย่อ
- **href:** `#fixed.php#CODE` (หรือ `#festival.php#CODE` สำหรับ festival hall) — code ตรงกับ `parseZones()` (`[A-Za-z0-9]+`, uppercased)

**coords sample (คาดหมาย — ไม่ได้จากสดวันนี้ เพราะ 403):** *ไม่มี sample จริงให้โชว์* — ต้องรอรอบที่ live 200 แล้วเก็บ 2 areas แรกจาก `zones.php?query=504` เช่น (จาก `zones.test.ts` fixture):
  - `A1 shape=rect coords=0,0,100,100 href=#fixed.php#A1`
  - `A2 shape=rect coords=100,0,200,100 href=#fixed.php#A2`
  - ของจริงจะเป็น `shape=poly coords=68,45,112,48,108,92,64,89 …` (poly 4–5 เหลี่ยม) — T03 probe ต้องแคป 2 บรรทัดแรกเมื่อกลับมา 200

**Parser ที่ T03 ต้องเพิ่ม (regex เดียวกับ `src/zones.ts:33` ไม่ใช้ cheerio):**

```ts
// ดึง hall image
const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)].map(m=>m[0]);
const withMap = imgTags.filter(s=> /usemap/i.test(s));
const src = withMap[0]?.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? null;
const hallImageUrl = src ? new URL(src, "https://booking.thaiticketmajor.com").toString() : null;

// ดึง areas (poly coords)
const mapBlocks = [...html.matchAll(/<map[^>]*>([\s\S]*?)<\/map>/gi)];
const areas = mapBlocks.flatMap(b=> [...b[1].matchAll(/<area\b[^>]*>/gi)].map(m=>{
  const tag=m[0];
  const href=tag.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
  const code=href.match(/#(?:fixed|festival)\.php#([A-Za-z0-9]+)/i)?.[1]?.toUpperCase() ?? "";
  const shape=tag.match(/shape=["']([^"']+)["']/i)?.[1] ?? "poly";
  const coordsStr=tag.match(/coords=["']([^"']+)["']/i)?.[1] ?? "";
  return { code, href, shape, coords: coordsStr.split(",").map(Number).filter(n=>!isNaN(n)) };
}));
```

- Fallback: ถ้าไม่มี `<map>` (บาง hall ใช้ `<svg>` — ยังไม่เจอสด) ให้หา `<area>` ทั้งหน้าแบบ global แล้ว warn `area count != zones length`
- Normalize: `src` relative → absolute, `code` uppercased, `coords` เป็น `number[]`

**Venue ที่ไม่มี `<img>` แต่เป็น `canvas/svg` มีจริงไหม:** สดวันนี้พิสูจน์ไม่ได้เพราะ 403 หมด แต่ `tickets/09/raw` + `src/book.ts:119` (`590×530 <img usemap>`) + ประวัติ 56KB zones ที่เคยได้ ไม่เคยพบ `canvas`/`svg` hall map — สันนิษฐานว่า **ไม่มีจริงใน TTM ปัจจุบัน** แต่ T03 ควร handle พิเศษแบบ soft: ถ้า `withMapCount===0` แต่มี `zones.length>0` ให้ fallback เป็น pills-only และ log warn `hall image missing — canvas/svg not detected` (ไม่ crash) พร้อม badge `map unavailable`

---

## 4) `fixed.php?k=…&zone=A1&round=…` — `#tableseats` โครงสร้าง

> **สดวันนี้:** `fixed.php` ก็ 403 414B — ไม่มี `#tableseats` ให้ parse

**ความคาดหมายเมื่อ live 200 (จาก `src/book.ts:317` `pickSeats()` + `scripts/a2-3`):**

```html
<table id="tableseats">
  <tr><td title="AA-01" data-info='{"seat":"AA-01-P*3800","seatk":"..."}'><div class="seatuncheck"></div></td>
      <td title="AA-02"><div class="seatnotavail"></div></td> …</tr>
  <tr><td title="BB-08"><div class="seatuncheck"></div></td> …</tr>
</table>
<form id="frmPayment">
  <input type="hidden" name="k" value="3001223…" />
  <input type="hidden" name="ehId" value="504" />
  <input type="hidden" id="rdId" value="81635" />
  <!-- หลัง click validateseat.php จะเพิ่ม <input id="hid-checkseat-…"> -->
</form>
```

- **Parser:** `/<table[^>]*id=["']tableseats["'][\s\S]*?<\/table>/i` → นับ `<tr>` rows, `<td>` cols ต่อ row, เก็บ `title` 8 ตัวแรก
- **สถานะ:** `div.seatuncheck` = ว่าง, `seatnotavail` = ไม่ว่าง, `seatchecked` = ที่เราเลือก (หลัง click) — T04 จะแมปสี
- **Rows/cols sample (เมื่อ 200):** ตัวอย่าง hall 15 โซน เช่น `D1` เคยมี `seatuncheck=35, seatnotavail=13, checked=0, rows ~10, cols ~12` (ต้องรอสดจริงเพื่อระบุตัวเลขแน่นอน) — 403 วันนี้ได้ `rows 0 cols 0 seatuncheck 0`
- **Hidden inputs:** `k` (32 hex), `ehId (=query)`, `rdId` (round) — T03 ไม่ต้อง parse fixed ที่นี่ แต่ต้องรู้ว่า `k`/`round` ที่ zones ให้มา ใช้ยิง fixed ได้เลย (ดู `src/book.ts:238` URL builder)

**Regex เดียวกับ `src/discover.ts:126` + `src/zones.ts`:**

```ts
const hasTable = html.includes('id="tableseats"');
const seatuncheck = (html.match(/seatuncheck/g)||[]).length;
const seatnotavail = (html.match(/seatnotavail/g)||[]).length;
const titles = [...html.matchAll(/title="([^"]+)"/g)].slice(0,8).map(m=>m[1]);
const tbl = html.match(/<table[^>]*id=["']tableseats["'][\s\S]*?<\/table>/i);
const rows = tbl ? [...tbl[0].matchAll(/<tr/gi)].length : 0;
```

---

## 5) Cache heal verdict — `discover-cache.json` ช่วยอะไรได้

**Local cache:** `C:/Users/bit-it.helpdesk/.bot-budcon-data/discover-cache.json`

```json
{ "fetchedAtMs": 1788330643424, "concertUrl": "https://www.thaiticketmajor.com/concert/", "events": 12 }
```

- อายุ 21h (1315m) — `stalenessLine(): "cached discovery: 12 events, 21h old (source: local)"`
- 8 events มี `zones/k/rounds` สมบูรณ์: `650(15), 622(13), 747(45), 597(2), 612(2), 504(15), 741(4), 557(15)` — 4 events ว่าง (`927, 524, 649, 517`)
- กลไก heal ใน `src/discover.ts:280-314` (`mergeWithCache` + เติม zones ที่หาย) ทำงานจริง: เมื่อ live 403 ทั้งหมด, `discover` จะ merge cached-only events และเติม `zones` ให้ `events` ที่ live ว่าง — UI จึงยังเห็น 8 halls พร้อมราคา/โซน แม้ booking dead (ตรงกับ `cache/discover-cache.json` ใน repo ที่ก็เก็บ 8 zones เดียวกัน, commit `dfe4791`)
- **แต่ hall image heal ยังไม่ได้:** `DiscoveredEvent` ปัจจุบันมีแค่ `{query, slug, title, zonesUrl, zones[], rounds[], k}` — ไม่มี `hallImageUrl`/`areas[]` จึงไม่มีรูปให้ heal — ต้องเพิ่ม field ใน T03 แล้วรอบที่ live 200 ค่อย `saveDiscoverCache()` ใหม่, Heal block จะเติม `hallImageUrl/areas` เดียวกับที่เติม `zones` ได้ทันที

**Repo cache:** `cache/discover-cache.json` (committed, `dfe4791`) มี 12 events เดียวกัน — ใช้ `seedLocalCacheFromRepo()` สำหรับ cold start / GitHub Actions

**เมื่อ booking 403 ต้อง fallback อะไร (สำหรับ T02/T03/T04):**
- โชว์ `discover-cache` heal + badge `stale 21h — live 403` (อย่าโชว์ว่า live)
- Hall map: ถ้าไม่มี `hallImageUrl` (ทุก event ตอนนี้) → โชว์ placeholder + pills (อย่า crash) + ปุ่ม `retry discover`
- Seat grid: ถ้า `fixed.php` 403 → โชว์ `seat grid unavailable — live blocked` + ไม่เด้งไป payment

---

## 6) อะไรต้องทำต่อ — T03 needs to parse

**T03: Backend — ดึง `imageUrl + area coords + rounds/k` แบบ realtime ไม่ hardcode**

1. **เพิ่ม `parseHallImage(html: string): string|null`** — regex `<img[^>]*usemap` → `src` → absolute URL (base `https://booking.thaiticketmajor.com`), คืน `null` ถ้าไม่มี
2. **เพิ่ม `parseAreas(html: string): {code, href, coords:number[], shape:string}[]`** — หา `<map><area>` ครบทุก zone, `shape` default `poly`, `coords` → `number[]`, `code` uppercased, dedupe แบบ `parseZones()`, verify `areas.length === zones.length` ถ้าไม่เท่า Warn แต่ยังส่งเท่าที่มี
3. **แก้ `DiscoveredEvent`** เพิ่ม `hallImageUrl: string|null` + `areas: Area[]` (optional migration: `hallImageUrl ?? null, areas ?? []` เพื่อไม่พัง cache เก่า — `loadDiscoverCache()` ต้องเติม default ถ้าไม่มี field)
4. **แก้ `discover-cache.ts` `mergeWithCache()`** heal `hallImageUrl/areas` เดียวกับ `zones/k/rounds` (live ว่างให้เติมจาก cache เดิม, live มีให้ override)
5. **แก้ `src/server.ts` `GET /api/events/discover` + `POST /api/events/preview`** ส่ง `hallImageUrl` + `areas` เพิ่ม (ไม่เปลี่ยน shape เดิม)
6. **Tests:** `src/discover.test.ts` 3 เคสใหม่ — `hallImage absolute`, `areas poly coords`, `heal hallImage from cache when 403`
7. **Verify:** `curl /api/events/discover?limit=12` เห็น `hallImageUrl` (absolute https) + `areas.length === zones.length` + `coords` 2 ตัวอย่างแรก สำหรับ event ที่ live 200 (ต้องรอรอบที่ Akamai ปลด 403 — ตอนนี้ verify ได้แค่ cache heal path)

**Regex ทั้งหมดต้อง style เดียวกับ `src/zones.ts:33` (ไม่มี cheerio/jsdom) และต้อง `new URL()` normalize `src`**

---

## 7) ไฟล์ probe ที่เก็บไว้ (อย่า commit HTML เต็ม)

- `T01-html-concert.html` — 80KB (truncated, เดิม 114KB 20 queries) — 200 OK sample
- `T01-html-zones-504.html` — 414B 403 Access Denied
- `T01-html-zones-650.html` — 414B 403 Access Denied
- `T01-html-zones-622.html` — 414B 403 Access Denied
- `T01-html-fixed-650-A1-cached.html` — 414B 403 Access Denied (fixed fallback)

> Cookies [REDACTED] — ไม่ log ค่าเต็ม, นับแค่ length + flags

---

## 8) Blocker ที่ต้องซื่อสัตย์

- **Live booking probe วันนี้ล้มเหลวทั้งหมดด้วย `403 hard deny` (414–416B)** — ไม่ได้ data สดของ hall image/coords/tableseats เลย จึงไม่มี sample จริงให้ T02 วาดสดได้วันนี้ — ต้องพึ่ง `discover-cache` heal + placeholder จนกว่า edge จะปลด (มักเป็นชั่วคราว 6–24h ตาม `tickets/A2-3`)
- **Canvas/SVG venue** ยังพิสูจน์ไม่ได้เพราะ 403 — แต่จากโค้ดและประวัติ ไม่น่ามีจริง
- **Max 5 requests เคารพแล้ว** — ไม่ยิงซ้ำเพื่อเลี่ยง IP scoring เพิ่ม

*Probe by T01 subagent, 2026-09-03 11:25 ICT, host Windows 10, curl/8.0.1 + hardened jar ([REDACTED])*
