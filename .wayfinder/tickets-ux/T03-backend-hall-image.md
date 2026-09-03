---
id: T03
title: Backend — ดึง imageUrl + area coords + rounds/k จาก zones.php แบบ realtime ไม่ hardcode
type: task
status: closed
blocks: [T05]
blocked_by: []
---

## Question

ทำอย่างไรให้ `discover` + `preview` ส่ง `hallImageUrl` + `areas: {code, href, coords, shape}[]` กลับมาให้ frontend วาดผังได้จริง — โดยไม่ hardcode และ reuse `hardenedFetcher` + `discover-cache` เดิม

## What I need to know

1. จาก T01 probe: `<img>` selector ที่เสถียรคืออะไร (`img[usemap]`? `img[src*="seat"]`?), `<map name>` + `<area>` coords format เป็น `poly` กี่จุด, ต้อง normalize src เป็น absolute URL อย่างไร
2. จะเติม field ใหม่ใน `DiscoveredEvent` (`src/discover.ts`) อย่างไรให้ไม่พัง `discover-cache.json` เก่า — ต้อง migrate cache อย่างไร
3. `POST /api/events/preview` ควรส่ง `hallImageUrl + areas` ด้วยไหม หรือให้ frontend เรียก `discover` อย่างเดียวพอ
4. Fallback เมื่อ `zones 403` — จะ heal `hallImageUrl/areas` จาก `cache` เดียวกับ `zones` เดิมได้ไหม ( reuse `heal` block ใน `discover.ts:280` )

## Method

- อ่าน `src/discover.ts:84-131` `extractConcertListing/parseRounds/parseK` + `src/zones.ts` เป็นฐาน — เพิ่ม `parseHallImage(html)` + `parseAreas(html)` สไตล์ regex เดียวกัน (ไม่เพิ่ม cheerio)
- แก้ `DiscoveredEvent` เพิ่ม `hallImageUrl: string | null` + `areas: {code, href, coords: number[], shape: string}[]` — เติม `mergeWithCache`/`staleness` ให้ heal ฟิลด์ใหม่ด้วย
- แก้ `src/server.ts` `GET /api/events/discover` + `POST /api/events/preview` ให้ส่งฟิลด์ใหม่กลับ (ไม่เปลี่ยน shape เดิม — เพิ่มเติมเท่านั้น)
- เขียน `src/discover.test.ts` เคส `hallImage` + `areas` ใหม่ 3 เคส

## Deliverable

- `src/discover.ts` + `src/discover-cache.ts` + `src/server.ts` แก้เสร็จ, `discover.test.ts` เขียว, `cache/discover-cache.json` ใหม่มี `hallImageUrl/areas` เมื่อ live ผ่าน
- Verify: `curl /api/events/discover?limit=12` เห็น `hallImageUrl` + `areas.length == zones.length` สำหรับ event ที่ live 200

## Resolution 2026-09-03 — T03 closed ✅ — backend ส่ง hall map ได้แล้ว

**Code**: `src/discover.ts` เพิ่ม `parseHallImage()` (`<img usemap>` → absolute URL via `new URL(src, booking)`) + `parseAreas()` (`<map><area href="#fixed…#CODE" shape poly coords>` → `{code,href,coords:number[],shape}` dedupe) + `DiscoveredEvent hallImageUrl/areas[]` + heal `hallImageUrl/areas` เดียวกับ `zones/k/rounds` (live ว่างเติมจาก cache, live มี override) + `_internal` export เพิ่ม 2 ฟังก์ชัน

`src/discover-cache.ts` `loadDiscoverCache()` migration เติม `hallImageUrl=null, areas=[]` ให้ cache เก่าไม่พัง

`src/server.ts` `POST /api/events/preview` ส่ง `hallImageUrl/areas` เพิ่ม + heal จาก cache เมื่อ `isWaf` เดียวกับ `zones`

**Tests**: `src/discover.test.ts` เคส `hallImage absolute / no usemap / heal` 3 เคส + `src/discover-cache.test.ts` อัปเดต `ev()` helper — `TSC:0 14 files 121 tests` (จาก 118)

**Verify live**: `curl /api/events/discover?limit=3` ตอน 403 จะได้ `hallImageUrl:null areas:[]` แต่ field มีครบ — รอบที่ live 200 จะมี `hallImageUrl https://booking…` + `areas.length==zones.length` อัตโนมัติและ `saveDiscoverCache()` เก็บลง local/repo cache ให้ heal ได้ทันที

Evidence: `src/discover.ts:137-176`, `src/server.ts:423-444`, `src/discover.test.ts:36-60`
