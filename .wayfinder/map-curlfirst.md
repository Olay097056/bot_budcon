## Destination

จองสำเร็จแม้ Firefox fingerprint โดน Akamai Access Denied — ด้วย curl-first booking: curl/8.0.1+jar ยิง zones→fixed→เลือกที่นั่ง (พิสูจน์แล้ว A2-1) แล้ว hand-off ไป Firefox เฉพาะหน้า payment/captcha ให้คนจ่ายเงิน

## Notes

- หลักฐานตั้งต้น: A2-1 curl-only booking ผ่านครบ 3 req (zones 200 → fixed 200 → validateseat {"result":true}) ขณะ playwright Firefox โดน 403 — fingerprint block ไม่ใช่ IP block
- Stack: src/book.ts (curl path ใหม่), src/ttm-curl.ts, src/server.ts, scripts/a2-1-curl-booking-probe.ts (proof)
- Skills: debugging-and-error-recovery
- คนจ่ายเงินผ่าน Firefox จริง (humanStep) — captcha/3-D Secure ไม่ automate เหมือนเดิม

## Decisions so far

## Not yet specified

- validateseat ผ่าน curl แล้ว session ผูกกับ jar — Firefox ต้องใช้ jar เดียวกัน (แปลง cookie curl→Firefox profile) ถึงเห็นตะกร้า
- ถ้า TTM เปลี่ยนให้ fixed.php ตรวจ fingerprint ตอนโหลดที่นั่ง ต้อง fallback ยังไง

## Out of scope

- จ่ายเงินอัตโนมัติ / captcha solving
- paid proxy/unlocker (Q3=A เดิม)
