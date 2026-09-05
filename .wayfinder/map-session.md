## Destination

จองจริงได้โดยไม่ต้อง re-create โปรเจค: ระบบตรวจ session สดก่อนยิงจองทุกครั้ง — session ตาย = แจ้งบน UI ทันทีพร้อมวิธีกู้ (3 ขั้น paste) — ไม่เดา ไม่ปลอม

## Notes

- หลักฐาน: PHPSESSID อายุสั้น (~30-60 นาที) — หมดอายุแล้ว zones.php ตอบ 200 แต่เป็น meta-refresh signin (71 bytes)
- โค้ด flow จองครบและผ่าน WAF แล้ว (map-curlfirst) — ปัญหาเดียวคือ session ตายเงียบ
- Skills: frontend-design-audit (UI feedback), debugging-and-error-recovery

## Decisions so far

## Not yet specified

- อายุจริงของ PHPSESSID ยังไม่เคยวัด (ต้องมี event เปิดขายหรือ login ใหม่วัด)

## Out of scope

- captcha solving / auto-login (Akamai deny automation ทุกแบบ — ปิดไปแล้วใน map-curlfirst)
