---
id: T01
title: ทำไม browserContext.newPage: Target closed — context ตายก่อนจอง LM5
type: research
status: closed
blocks: []
blocked_by: []
---

## Question

ทำไมกดจอง LM5 แล้ว `browserContext.newPage: Target page, context or browser has been closed` ทั้งที่เพิ่ง login สด และจะกันไม่ให้ context ปิดกลางทางได้อย่างไร?

## Resolution

**สาเหตุ:** `BotEngine.getContext()` คืน `_context` เดิมทันทีโดยไม่เช็คว่า `isClosed()` หรือ `browser.isConnected()==false` — ถ้าผู้ใช้ปิด Firefox, crash, หรือ `watch-manager` ปิด context ระหว่าง `engine.getContext()` กับ `book.ts:82 ctx.newPage()` จะ throw `Target closed` ทันที

**แก้:**
- `src/bot-engine.ts` `getContext()` เพิ่ม dead check: `isClosed()` + `browser.isConnected()` + `pages()` throws → ถ้า dead ให้ `close()` + `_context=null` + recreate `launchPersistentContext` ใหม่ ก่อนคืน
- `src/server.ts` `POST /api/book/start` เพิ่ม retry 1 ครั้ง: ถ้า `msg includes Target && closed` ให้ `log retry` + `getContext()` ใหม่ (ตอนนี้จะได้ context สด) + `book()` อีกรอบ — แยก HumanStepRequired ของ retry ด้วย

**ทดสอบ LM5:** `curl POST /api/book/start LM5` ครั้งแรกหลัง restart → `{"step":"payment","humanStep":true}` ไม่ `Target closed` อีก (ก่อนแก้ เจอทุกครั้งที่ context ตาย)

## Deliverable

- patch `src/bot-engine.ts` + `src/server.ts` — `npx tsc --noEmit` 0 + `vitest 121`
