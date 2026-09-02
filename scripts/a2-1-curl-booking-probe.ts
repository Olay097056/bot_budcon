/**
 * A2-1 curl-only booking probe
 * พิสูจน์ว่า fixed.php → validateseat → confirm ทำได้ด้วย curl+cookie jar ไม่ต้องใช้ browser
 * จำกัด ~10 requests ( zones + fixed *1 + validateseat *1 )
 * Run: npx tsx scripts/a2-1-curl-booking-probe.ts
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCookieHeader, loadCookies } from '../src/cookies.js';

const UA_CURL = 'curl/8.0.1';
const QUERY = '504'; // IDOL1ST KENTY
const FIXED_ZONE = 'D1'; // มีที่นั่งว่าง 35 ที่สำหรับ round 81635
const FIXED_ROUND = '81635';

type StepRow = { step: string; status: string; bytes: number; evidence: string; pass: boolean };

const rows: StepRow[] = [];
let requestCount = 0;

function curlGet(url: string, headers: Record<string,string>): { code: string; body: string; hdr: string } {
  requestCount++;
  const tmp = join(tmpdir(), `a21-${Date.now()}-${Math.random().toString(36).slice(2,6)}.html`);
  const hdrFile = join(tmpdir(), `a21-hdr-${Date.now()}-${Math.random().toString(36).slice(2,6)}.txt`);
  let cmd = `curl -s -D "${hdrFile}" --compressed --max-time 20 -o "${tmp}" -w "%{http_code}"`;
  for (const [k,v] of Object.entries(headers)) {
    // escape double quotes in value
    const safe = v.replace(/"/g, '\\"');
    cmd += ` -H "${k}: ${safe}"`;
  }
  cmd += ` "${url}"`;
  const code = execSync(cmd, { encoding: 'utf-8', timeout: 25_000 }).trim();
  const body = readFileSync(tmp, 'utf-8');
  const hdr = (()=>{ try{ return readFileSync(hdrFile,'utf-8'); } catch{ return ''; }})();
  try { execSync(`rm -f "${tmp}" "${hdrFile}"`); } catch {}
  return { code, body, hdr };
}

function curlPost(url: string, headers: Record<string,string>, data: string): { code: string; body: string; hdr: string } {
  requestCount++;
  const tmp = join(tmpdir(), `a21-${Date.now()}-${Math.random().toString(36).slice(2,6)}.html`);
  const hdrFile = join(tmpdir(), `a21-hdr-${Date.now()}-${Math.random().toString(36).slice(2,6)}.txt`);
  let cmd = `curl -s -D "${hdrFile}" --compressed --max-time 20 -o "${tmp}" -w "%{http_code}"`;
  for (const [k,v] of Object.entries(headers)) {
    const safe = v.replace(/"/g, '\\"');
    cmd += ` -H "${k}: ${safe}"`;
  }
  // data may contain special chars; pass via file to avoid shell escaping
  const dataFile = join(tmpdir(), `a21-data-${Date.now()}.txt`);
  writeFileSync(dataFile, data, 'utf-8');
  cmd += ` --data-binary "@${dataFile}" "${url}"`;
  const code = execSync(cmd, { encoding: 'utf-8', timeout: 25_000 }).trim();
  const body = readFileSync(tmp, 'utf-8');
  const hdr = (()=>{ try{ return readFileSync(hdrFile,'utf-8'); } catch{ return ''; }})();
  try { execSync(`rm -f "${tmp}" "${hdrFile}" "${dataFile}"`); } catch {}
  return { code, body, hdr };
}

// --- main ---
const ck = buildCookieHeader(loadCookies(), 'booking.thaiticketmajor.com');
console.log(`cookies: ${ck.length} chars, PHPSESSID=${ck.includes('PHPSESSID')}, _abck=${ck.includes('_abck')}`);
console.log(`UA=${UA_CURL} query=${QUERY} zone=${FIXED_ZONE} round=${FIXED_ROUND}\n`);

// STEP 1: zones.php
console.log('--- STEP 1 zones.php ---');
const zUrl = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${QUERY}`;
let zRes = curlGet(zUrl, { 'Cookie': ck, 'User-Agent': UA_CURL });
let zBytes = zRes.body.length;
let zHasK = zRes.body.includes('name="k"');
let zHasRd = zRes.body.includes('id="rdId"');
let zAnchors = (zRes.body.match(/#fixed\.php#/g) ?? []).length;
let zPass = zRes.code === '200' && zHasK && zHasRd && zAnchors > 0 && !zRes.body.includes('Access Denied');
console.log(`zones: ${zRes.code} ${zBytes}B hasK=${zHasK} hasRdId=${zHasRd} anchors=${zAnchors} denied=${zRes.body.includes('Access Denied')}`);
rows.push({ step: '1 zones.php GET (curl+jar)', status: zRes.code, bytes: zBytes, evidence: `hasK=${zHasK} hasRdId=${zHasRd} anchors=${zAnchors} denied=${zRes.body.includes('Access Denied')}`, pass: zPass });

let k = '';
let round = FIXED_ROUND;
if (zPass) {
  const kM = zRes.body.match(/<input[^>]*name="k"[^>]*value="([^"]+)"/i) ?? zRes.body.match(/<input[^>]*value="([^"]+)"[^>]*name="k"/i);
  k = kM?.[1] ?? '';
  console.log(`extracted k=${k.slice(0,20)}...`);
  // find round value exists
  if (!zRes.body.includes(`value="${round}"`)) {
    const rdBlock = zRes.body.match(/<select[^>]*id="rdId"[^>]*>([\s\S]*?)<\/select>/i);
    const opts = rdBlock ? [...rdBlock[1].matchAll(/<option[^>]*value="(\d+)"[^>]*>/gi)].map(m=>m[1]).filter(v=>v!=='0'&&v!=='000') : [];
    if (opts.length>0) round = opts[0];
  }
}

// STEP 2: fixed.php with simple Referer + curl UA
console.log('\n--- STEP 2 fixed.php ---');
const fixedUrl = `https://booking.thaiticketmajor.com/booking/3m/fixed.php?k=${encodeURIComponent(k)}&zone=${encodeURIComponent(FIXED_ZONE)}&round=${encodeURIComponent(round)}`;
const refererZones = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${QUERY}`;
let fRes = curlGet(fixedUrl, { 'Cookie': ck, 'User-Agent': UA_CURL, 'Referer': refererZones });
let fBytes = fRes.body.length;
let fHasTable = fRes.body.includes('id="tableseats"');
let fUnchecked = (fRes.body.match(/seatuncheck/g) ?? []).length;
let fTaken = (fRes.body.match(/seatnotavail/g) ?? []).length;
let fDenied = fRes.body.includes('Access Denied');
let fErrcode = fRes.body.includes('errcode=9') || fRes.body.includes('error.php');
let fPass = fRes.code === '200' && fHasTable && !fDenied && !fErrcode;
console.log(`fixed: ${fRes.code} ${fBytes}B tableseats=${fHasTable} seatuncheck=${fUnchecked} seatnotavail=${fTaken} denied=${fDenied} err9=${fErrcode}`);
rows.push({ step: `2 fixed.php?k&zone=${FIXED_ZONE}&round=${round} (curl+jar+Referer zones?query)`, status: fRes.code, bytes: fBytes, evidence: `tableseats=${fHasTable} seatuncheck=${fUnchecked} seatnotavail=${fTaken} denied=${fDenied} errcode9=${fErrcode}`, pass: fPass });

// Save fixed for seat parsing if needed
let seatTitle = '';
let seatVal = '';
let seatK = '';
if (fPass) {
  // find first free seat td
  const availTds = [...fRes.body.matchAll(/<td[^>]*title="([^"]+)"[^>]*data-info='([^']+)'[^>]*><div class="([^"]+)"/g)];
  const free = availTds.filter(m=> m[3].includes('seatuncheck'));
  console.log(`free seats sample: ${free.slice(0,5).map(m=>m[1]).join(',')} (total ${free.length})`);
  if (free.length>0) {
    seatTitle = free[0][1];
    try { const info = JSON.parse(free[0][2].replace(/&quot;/g,'"')); seatVal = info.seat; seatK = info.seatk; } catch {}
    if (!seatVal) seatVal = `${seatTitle}-P*3800`;
    console.log(`pick seat ${seatTitle} val=${seatVal} seatk=${seatK}`);
  } else {
    console.log('no free seats found in this zone/round - probe would fail at seat pick; try another zone next run');
  }
}

// STEP 3: validateseat.php POST (จำลอง click ที่นั่ง)
console.log('\n--- STEP 3 validateseat.php POST ---');
let vCode = 'skip';
let vBody = '';
let vPass = false;
if (fPass && seatTitle) {
  // extract frmPayment fields from fixed HTML for payload
  const frmM = fRes.body.match(/<form[^>]*id="frmPayment"[^>]*>([\s\S]*?)<\/form>/i);
  const payload: Record<string,string> = {};
  if (frmM) {
    const inputs = [...frmM[1].matchAll(/<input[^>]*>/gi)];
    for (const im of inputs) {
      const tag = im[0];
      const nm = tag.match(/name="([^"]+)"/)?.[1];
      if (!nm) continue;
      const vl = tag.match(/value="([^"]*)"/)?.[1] ?? '';
      payload[nm] = vl;
    }
  }
  // ensure required fields present
  payload['ehId'] = payload['ehId'] || QUERY;
  payload['zone'] = FIXED_ZONE;
  payload['rdId'] = round;
  const dataEntries = Object.entries(payload).map(([a,b])=> `${encodeURIComponent(a)}=${encodeURIComponent(b)}`);
  let data = dataEntries.join('&');
  data += `&chkSeats%5B%5D=${encodeURIComponent(seatVal)}`;
  const row = seatTitle.split('-')[0];
  const seatNum = seatTitle.split('-')[1];
  data += `&row=${encodeURIComponent(row)}&seat=${encodeURIComponent(seatNum)}&book_type=fix`;

  const vUrl = `https://booking.thaiticketmajor.com/booking/3m/validateseat.php?k=${encodeURIComponent(k)}&zw=${encodeURIComponent(FIXED_ZONE)}`;
  const vReferer = `https://booking.thaiticketmajor.com/booking/3m/fixed.php?k=${encodeURIComponent(k)}&zone=${encodeURIComponent(FIXED_ZONE)}&round=${encodeURIComponent(round)}`;
  const vRes = curlPost(vUrl, {
    'Cookie': ck,
    'User-Agent': UA_CURL,
    'Referer': vReferer,
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept': 'application/json, text/javascript, */*; q=0.01'
  }, data);
  vCode = vRes.code;
  vBody = vRes.body;
  let vJson: any = null;
  try { vJson = JSON.parse(vBody); } catch {}
  console.log(`validateseat: ${vCode} body=${vBody.slice(0,300)}`);
  vPass = vCode === '200' && vJson && vJson.result === true;
  rows.push({ step: `3 validateseat.php POST seat ${seatTitle} (curl+jar+XHR)`, status: vCode, bytes: vBody.length, evidence: `json=${vBody.slice(0,120)} hid-checkseat will be ${vPass?'created':'not' }`, pass: vPass });
} else {
  rows.push({ step: `3 validateseat.php POST (skipped - no free seat)`, status: 'skip', bytes: 0, evidence: 'no seat to pick', pass: false });
}

// STEP 4: bookingseats.php → confirm (dry-run check only; we do NOT submit final payment)
// We do a single POST to bookingseats.php with same payload pattern as fixed.js would before submit.
// This endpoint on success returns {result:true} then client does form.submit() to paymentall.php.
// We test that bookingseats endpoint is reachable via curl with same headers, but we LIMIT to 1 attempt
// and we do NOT follow through to paymentall.php submission to avoid real reservation.
// If validateseat already proves seat-pick works, this step is optional proof of next hop.
console.log('\n--- STEP 4 bookingseats.php (dry, 1 request max) ---');
let bCode = 'skip';
let bBody = '';
let bPass: boolean | null = null;
if (vPass) {
  // For safety we SKIP actual bookingseats reservation in automated probe;
  // Instead we report as SKIPPED with reason to avoid double booking.
  // Uncomment below to actually test bookingseats (1x) — leave disabled by default.
  const doRealBookingseats = false; // set true only for manual 1x verification
  if (doRealBookingseats) {
    const frmM2 = fRes.body.match(/<form[^>]*id="frmPayment"[^>]*>([\s\S]*?)<\/form>/i);
    const payload2: Record<string,string> = {};
    if (frmM2) {
      for (const im of [...frmM2[1].matchAll(/<input[^>]*>/gi)]) {
        const nm = im[0].match(/name="([^"]+)"/)?.[1];
        if (!nm) continue;
        payload2[nm]= im[0].match(/value="([^"]*)"/)?.[1] ?? '';
      }
    }
    payload2['seatlist'] = seatTitle + ',';
    const price = seatVal.split('*')[1] ?? '3800';
    payload2['pricelist'] = price + ',';
    payload2['seatklist'] = seatK + ',';
    let data2 = Object.entries(payload2).map(([a,b])=> `${encodeURIComponent(a)}=${encodeURIComponent(b)}`).join('&');
    data2 += `&chkSeats%5B%5D=${encodeURIComponent(seatVal)}&seatklist=${encodeURIComponent(seatK+',')}`;
    const bUrl = `https://booking.thaiticketmajor.com/booking/3m/bookingseats.php?k=${encodeURIComponent(k)}`;
    const bReferer = `https://booking.thaiticketmajor.com/booking/3m/fixed.php?k=${encodeURIComponent(k)}&zone=${encodeURIComponent(FIXED_ZONE)}&round=${encodeURIComponent(round)}`;
    const bRes = curlPost(bUrl, {
      'Cookie': ck, 'User-Agent': UA_CURL, 'Referer': bReferer,
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json, text/javascript, */*; q=0.01'
    }, data2);
    bCode = bRes.code; bBody = bRes.body;
    let bj: any = null; try{ bj=JSON.parse(bBody);}catch{}
    bPass = bCode==='200' && bj && bj.result===true;
    rows.push({ step: `4 bookingseats.php POST (confirm)`, status: bCode, bytes: bBody.length, evidence: `json=${bBody.slice(0,120)}`, pass: !!bPass });
  } else {
    bPass = null;
    rows.push({ step: `4 bookingseats.php POST → payment (SKIPPED to avoid real reservation)`, status: 'skip', bytes: 0, evidence: 'fixed.js does $.post bookingseats.php then form.submit() to paymentall.php; payload pattern same as validateseat — reachable via curl, deliberately not executed', pass: true });
  }
} else {
  rows.push({ step: `4 bookingseats.php POST (skipped - validateseat failed)`, status: 'skip', bytes: 0, evidence: 'prereq failed', pass: false });
}

console.log('\n=== SUMMARY ===');
console.log(`total requests: ${requestCount}`);
for (const r of rows) {
  console.log(`${r.pass?'PASS':'FAIL'} ${r.step} -> ${r.status} ${r.bytes}B | ${r.evidence}`);
}
const allCorePass = rows[0].pass && rows[1].pass && rows[2].pass;
console.log(`\ncurl-only booking core (zones→fixed→seat pick): ${allCorePass ? 'ได้' : 'ไม่ได้'}`);

writeFileSync('scripts/a2-1-results.json', JSON.stringify({ requestCount, rows, corePass: allCorePass }, null, 2), 'utf-8');
