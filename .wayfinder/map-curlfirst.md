## Destination

จองสำเร็จแม้ Firefox fingerprint โดน Akamai Access Denied — ด้วย curl-first booking: curl/8.0.1+jar ยิง zones→fixed→เลือกที่นั่ง (พิสูจน์แล้ว A2-1) แล้ว hand-off ไป Firefox เฉพาะหน้า payment/captcha ให้คนจ่ายเงิน

## Notes

- หลักฐานตั้งต้น: A2-1 curl-only booking ผ่านครบ 3 req (zones 200 → fixed 200 → validateseat {"result":true}) ขณะ playwright Firefox โดน 403 — fingerprint block ไม่ใช่ IP block
- Stack: src/book.ts (curl path ใหม่), src/ttm-curl.ts, src/server.ts, scripts/a2-1-curl-booking-probe.ts (proof)
- Skills: debugging-and-error-recovery
- คนจ่ายเงินผ่าน Firefox จริง (humanStep) — captcha/3-D Secure ไม่ automate เหมือนเดิม

## Decisions so far

- [C02 cookie jar → Firefox hand-off](tickets-curlfirst/C02-cookie-jar-handoff.md): mapping sameSite secure?None:Lax + curl -c write-back + _abck A/B plan
- [C01 curl zone-seat path](tickets-curlfirst/C01-curl-zone-seat.md): curlBook() ครบ zones→fixed→validateseat + fresh-session retry (stale jar 403 → no-cookie 200 พิสูจน์แล้ว) + wire fallback ใน book() — 741 ทดสอบได้ 'no k/round' ถูกต้อง

- [C02 cookie jar → Firefox hand-off](tickets-curlfirst/C02-cookie-jar-handoff.md): mapping พร้อม implement (sameSite กฎ secure?None:Lax) + แก้ blocker Set-Cookie ด้วย curl -c write-back — เสี่ยงหลักคือ _abck fingerprint mismatch ต้อง A/B ทดสอบ

## Not yet specified

- คำตอบ _abck A/B (sync หมด vs ตัด) — เฉลยตอน C03 ทดสอบจริง
- ตรวจ Set-Cookie หลัง validateseat จริง (curl -c write-back ยังไม่ได้ผูกเข้า saveCookies)

## Out of scope

- จ่ายเงินอัตโนมัติ / captcha solving
- paid proxy/unlocker (Q3=A เดิม)
