# C02 — curl cookie jar → Playwright Firefox context.addCookies (hand-off ไป payment)

## สิ่งที่รู้จากโค้ด (ไม่เดา)

**Jar format ฝั่ง curl (`src/cookies.ts`)** — `StoredCookie`:
`{ name, value, domain (leading dot เสมอ), path (default "/"), secure, httpOnly, expires (Unix sec, -1 = session) }`
- `normalizeCookie()` บังคับ domain ให้ขึ้นต้นด้วย `.` และทิ้ง cookie ที่หมดอายุแล้ว
- `buildCookieHeader()` filter ตาม domain-suffix แล้ว join เป็น header สำหรับ curl
- `cookies.json` = JSON array ตรง ๆ (ไม่ใช่ Netscape format)

**Playwright `context.addCookies()` ต้องการ**:
`{ name, value, domain | url, path, expires (Unix sec หรือ -1), httpOnly, secure, sameSite ('Strict'|'Lax'|'None') }`
→ format ใกล้กันมาก ขาดแค่ `sameSite` + ตรวจ `expires`.

## Mapping design (pseudo-code)

```ts
import { loadCookies } from '../src/cookies.js';

const TTM_DOMAINS = ['.thaiticketmajor.com',
  '.www.thaiticketmajor.com', '.event.thaiticketmajor.com',
  '.booking.thaiticketmajor.com']; // booking cookies มักอยู่ภายใต้ .thaiticketmajor.com อยู่แล้ว

function toPlaywrightCookie(c: StoredCookie) {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain.startsWith('.') ? c.domain : '.' + c.domain,
    path: c.path ?? '/',
    expires: c.expires && c.expires > 0 ? c.expires : -1,
    httpOnly: !!c.httpOnly,
    secure: !!c.secure,
    sameSite: c.secure ? 'None' : 'Lax',
  };
}

// hand-off หลัง curl จบ validateseat (ตะกร้าผูกกับ PHPSESSID ของ session นั้น)
const pwCookies = loadCookies()
  .filter(c => TTM_DOMAINS.includes(c.domain))   // ตัด bing/twitter/facebook/clarity ทิ้ง
  .map(toPlaywrightCookie);
await context.addCookies(pwCookies);
await page.goto('https://booking.thaiticketmajor.com/booking/3m/paymentall.php', ...);
```

ข้อควรระวังของ mapping:
1. **`sameSite`**: Firefox/Playwright บังคับว่า `SameSite=None` ต้องคู่กับ `secure: true` — ไม่งั้น addCookies โยน error. ใช้กฎ `secure ? 'None' : 'Lax'` ตามด้านบน ปลอดภัยสุด (ถ้าไม่แน่ใจใช้ `'Lax'` หมดก็ส่ง cookie ได้ปกติเพราะเป็น top-level navigation).
2. **`expires: -1`** ทุกตัวในไฟล์ปัจจุบัน → เป็น session cookie ฝั่ง Playwright ด้วย ใช้ได้ตรง ๆ ไม่ต้องแปลง
3. **Domain ที่ไม่ใช่ public suffix**: `.www.thaiticketmajor.com` / `.event.thaiticketmajor.com` addCookies ได้ (ไม่ใช่ public suffix) — แต่ถ้าเจอ error ให้ fallback เป็น `url: 'https://<host>'` แทน `domain`.
4. อย่า addCookies ตอน context กำลังมี page เปิดอยู่และกำลังโหลด — ยิงก่อน `page.goto` แรกของ hand-off.

## Cookies ที่ต้อง sync (ชื่อจาก cookies.json — ไม่แสดง value)

**จำเป็นต่อ session/ตะกร้า:**
- `PHPSESSID` (`.thaiticketmajor.com`, Secure+HttpOnly) — **ตัวชี้ขาด** ตะกร้า/ hid-checkseat ผูกกับ session นี้
- `tixid`, `tixu`, `ttkname`, `ttkemail`, `cdnname`, `ttmfw` — ตัวตนผู้ซื้อฝั่ง TTM (paymentall อาจดึงข้อมูลผู้ซื้อจากตัวพวกนี้)

**Akamai/WAF (สำคัญกับการไม่โดน 403 ตอนเปิด payment):**
- `_abck`, `bm_sz`, `bm_sv`, `bm_mi`, `ak_bmsc` (`.thaiticketmajor.com`)

**Huawei WAF:**
- `HWWAFSESID`, `HWWAFSESTIME` (ทั้ง `.www.` และ `.event.`)

**Analytics (sync ได้แต่ไม่จำเป็น):** `_ga`, `_ga_VQH8622D4L`, `_gcl_au`, `_clck`, `_clsk`, `__gads`, `__gpi`, `__eoi`, `_fbp`, `_twpid`, `__lt__cid`, `__lt__sid` — ตัดทิ้งได้เพื่อลด noise

## Set-Cookie หลัง validateseat — ข้อมูลสด

**BLOCKER (บางส่วน):** proof script (`a2-1-curl-booking-probe.ts`) ลง `-D hdrFile` แต่**ไม่ได้ dump/เก็บ header ไว้** — `a2-1-results.json` มีแต่ status/body-length/evidence จึง**ไม่มีหลักฐานว่า validateseat.php คืน Set-Cookie อะไรบ้าง** (เช่น ถ้ามีการ rotate PHPSESSID หรือออก `bm_sv` ใหม่หลังจองสำเร็จ เราจะไม่รู้)

**ที่รู้จาก recon เดิม (`tickets/09/phase2-recon.md`)**: endpoints ฝั่ง www คืน `Set-Cookie: HWWAFSESID, HWWAFSESTIME, PHPSESSID, ak_bmsc, bm_mi` — แต่เป็นของหน้าแรก ไม่ใช่ validateseat โดยตรง

**ข้อเสนอแก้ blocker (ง่าย ไม่ต้องยิงใหม่ถ้าไม่อยากเสี่ยง):**
1. แก้ `curlGet/curlPost` ใน probe ให้ `writeFileSync('scripts/a2-1-headers.log', hdr, {flag:'a'})` ก่อน rm — รอบรันถัดไปจะได้ Set-Cookie จริง
2. หรือให้ curl เขียน jar กลับ (`-c jar.txt`) แล้ว `saveCookies()` merge ทับ cookies.json หลังจบ validateseat — ถ้า server rotate อะไร jar จะอัปเดตเอง และ hand-off ใช้ค่าล่าสุดเสมอ (วิธีนี้ดีกว่า เพราะไม่ต้อง parse Set-Cookie เอง)

## แผน implement (สรุป)

```
curl flow (zones→fixed→validateseat, UA=curl/8.0.1 + jar + Referer)
  └─ จบแล้ว: บังคับ curl -c ให้เขียน jar กลับ → saveCookies(merge)
playwright firefox:
  context = browser.newContext(...)
  cookies = loadCookies().filter(domain in TTM).map(toPlaywrightCookie)
  await context.addCookies(cookies)
  page.goto paymentall.php (Referer = หน้า confirm เดิม ถ้าจำเป็น)
  assert: ยังเห็น hid-checkseat / seat list = ตะกร้าต่อเนื่อง
  ถ้าโดน 403: ลอง sync เฉพาะ session+identity cookies โดยตัด _abck/bm_* ทิ้ง
    (Akamai อาจ re-issue ให้ browser จริงเอง — การยัด _abck เก่าของ curl fingerprint
     อาจทำให้ sensor detection flag มากกว่าช่วย)
```

## จุดเสี่ยง

1. **`_abck` ผูกกับ fingerprint ผู้ยิง** — ค่าที่ curl ได้มาถูก validate ภายใต้ UA `curl/8.0.1`; พอเอาไปใช้ใน Firefox จริง Akamai อาจ detect mismatch แล้ว 403 (ซึ่งเป็นอาการเดิมที่ playwright โดนอยู่แล้ว) → ควรทดสอบ 2 แบบ: (a) sync ทุก cookie (b) ตัด `_abck/bm_*` ออกให้ browser เจนใหม่
2. **PHPSESSID rotate ตอน validateseat** — ถ้าไม่ dump header จะไม่รู้; แก้ด้วย `-c` jar write-back ตามด้านบน
3. **Session timeout สั้น** — ช่องว่างระหว่าง curl จบถึง Firefox เปิด payment ต้องเร็ว (หลักวินาที–สิบวินาที)
4. **sameSite/secure mismatch** → addCookies throw; ใช้กฎ mapping ด้านบนกันไว้
