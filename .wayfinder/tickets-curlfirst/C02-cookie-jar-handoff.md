---
id: C02
title: แปลง cookie jar ของ curl → Firefox profile ให้ session ต่อเนื่องถึง payment
type: research
status: closed
blocks: [C03]
blocked_by: []
---

## Question

validateseat ผูกตะกร้ากับ session ใน jar — จะ sync cookies (PHPSESSID ฯลฯ) กลับเข้า Firefox profile อย่างไรให้หน้า payment เห็นตะกร้าเดียวกัน (context.addCookies กับ format expire/domain ต่างกัน)?

## Resolution

**ออกแบบเสร็จ** (`.wayfinder/tickets-curlfirst/C02-result.md`):
- Mapping: StoredCookie → Playwright cookie เกือบตรง ขาดแค่ `sameSite` ใช้กฎ `secure ? 'None' : 'Lax'`; `expires:-1` ใช้ได้เลย
- Sync เฉพาะ domain TTM: PHPSESSID (ตัวชี้ขาดตะกร้า) + identity (tixid/ttkname ฯลฯ) + WAF (_abck/bm_*/HWWAF*) — ตัด analytics
- **Blocker จริง:** ไม่มีหลักฐาน Set-Cookie หลัง validateseat (proof script ไม่เก็บ header) → แก้ด้วย `curl -c` write-back jar + `saveCookies()` merge แทน parse Set-Cookie เอง
- **จุดเสี่ยง:** `_abck` ผูก fingerprint — ต้องทดสอบ 2 แบบ (sync หมด vs ตัด Akamai cookies ให้ browser เจนใหม่); hand-off ต้องเร็ว (session timeout สั้น)
