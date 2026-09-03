## Destination

จอง LM5 (และทุกโซน) สำเร็จจริง 100%: ไม่ `Target closed` อีก และ `ไปหน้าจ่ายเงิน` คือถึงหน้าชำระเงินจริง — browser ตรงกับที่ระบบรายงาน

## Notes

- **Stack**: `src/book.ts` `src/server.ts` `src/bot-engine.ts` `src/watch-manager.ts`
- **Skills**: wayfinder, debugging-and-error-recovery
- **Lab**: LM5 = โซน 747 Thailand Philharmonic 45 โซน — `fixed.php?zone=LM5&round=82047` ทดสอบสด
- **Constraints**: ต้องไม่ทำลาย fix 62eb3c3 (evaluate click + hall alignment + speed)

## Decisions so far

- [T01 Target closed](tickets-lm5-fix/T01-context-closed.md): `getContext()` ไม่เช็ค `isClosed`/`isConnected` → `newPage()` throw — แก้ dead check + recreate + server retry 1 ครั้ง — LM5 ครั้งแรก humanStep ผ่านแล้ว
- [T02 ไปหน้าจ่ายเงินทิพย์](tickets-lm5-fix/T02-payment-not-reached.md): `confirmSeats` คืน ok ทันทีหลัง click ไม่เช็ค url — แก้ verify `still fixed.php && !hasPayment && stillHasBookBtn → error` ทำให้รายงานตรง browser
- [T03 ยิง 5 ครั้งติด](tickets-lm5-fix/T03-lm5-e2e-verify.md): ใช้ page เดิมค้างที่ payment ครั้งก่อน — แก้ fresh page เมื่อ isClosed/payment url, duck-type `isClosed`/`url` รองรับ mock — 5/5 attempts ไม่ Target closed ไม่ Protocol error ไม่ false positive, error ตรง browser

## Not yet specified

## Out of scope

- ระบบชำระเงินจริง (humanStep)
- paid proxy
