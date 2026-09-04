/**
 * C01 — curl-first booking: zones→fixed→seat-pick→validateseat ผ่าน curl
 * (พิสูจน์แล้วว่าผ่าน Akamai แม้ Firefox fingerprint โดน 403 — A2-1)
 * ผลลัพธ์: seat locked ใน session (jar) → caller hand-off ไป Firefox หน้า payment
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildCookieHeader, loadCookies, type StoredCookie } from './cookies.js';

const UA_CURL = 'curl/8.0.1';

export interface CurlSeat {
  title: string;   // เช่น "D1-17"
  seatVal: string; // chkSeats[] value
  seatK: string;
  price: string;
}

export interface CurlBookResult {
  ok: boolean;
  step: 'zones' | 'fixed' | 'validateseat' | 'done';
  k: string;
  round: string;
  zone: string;
  seats: CurlSeat[];
  error?: string;
  /** cookies ล่าสุดหลัง flow (สำหรับ hand-off ไป Firefox) */
  jar: StoredCookie[];
}

function curlReq(
  url: string,
  headers: Record<string, string>,
  data?: string,
): { code: string; body: string; setCookies: string; jarContent: string } {
  const tmp = join(tmpdir(), `cb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.html`);
  const hdr = join(tmpdir(), `cb-h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`);
  const jar = join(tmpdir(), `cb-j-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.txt`);
  let cmd = `curl -s -D "${hdr}" -c "${jar}" --compressed --max-time 20 -o "${tmp}" -w "%{http_code}"`;
  for (const [k, v] of Object.entries(headers)) {
    cmd += ` -H "${k}: ${v.replace(/"/g, '\\"')}"`;
  }
  let dataFile = '';
  if (data !== undefined) {
    dataFile = join(tmpdir(), `cb-d-${Date.now()}.txt`);
    writeFileSync(dataFile, data, 'utf-8');
    cmd += ` --data-binary "@${dataFile}"`;
  }
  cmd += ` "${url}"`;
  let code = '0';
  try {
    code = (execSync(cmd, { encoding: 'utf-8', timeout: 25_000 }) as string).trim();
  } catch (e) {
    const m = String(e).match(/"([0-9]{3})"/);
    if (m) code = m[1] as string;
  }
  let body = '';
  let setCookies = '';
  let jarContent = '';
  try { body = readFileSync(tmp, 'utf-8'); } catch {}
  try {
    const h = readFileSync(hdr, 'utf-8');
    setCookies = [...h.matchAll(/^[Ss]et-[Cc]ookie:\s*(.+)$/gm)].map(m => m[1]).join('\n');
  } catch {}
  try { jarContent = readFileSync(jar, 'utf-8'); } catch {}
  try { execSync(`rm -f "${tmp}" "${hdr}" "${jar}" "${dataFile}"`); } catch {}
  return { code, body, setCookies, jarContent };
}

function extractK(body: string): string {
  return body.match(/<input[^>]*name="k"[^>]*value="([^"]+)"/i)?.[1]
    ?? body.match(/<input[^>]*value="([^"]+)"[^>]*name="k"/i)?.[1]
    ?? '';
}

function extractRounds(body: string): string[] {
  const blk = body.match(/<select[^>]*id="rdId"[^>]*>([\s\S]*?)<\/select>/i);
  if (!blk) return [];
  const inner = blk[1] as string;
  return [...inner.matchAll(/<option[^>]*value="(\d+)"[^>]*>/gi)]
    .map(m => m[1] as string)
    .filter(v => v !== '0' && v !== '000');
}

function parseSeats(body: string): CurlSeat[] {
  const out: CurlSeat[] = [];
  for (const m of body.matchAll(/<td[^>]*title="([^"]+)"[^>]*data-info='([^']+)'[^>]*><div class="([^"]+)"/g)) {
    const cls = (m[3] ?? '') as string;
    if (!cls.includes('seatuncheck')) continue; // เอาเฉพาะที่ว่าง
    let seatVal = '';
    let seatK = '';
    try {
      const info = JSON.parse((m[2] as string).replace(/&quot;/g, '"'));
      seatVal = info.seat ?? '';
      seatK = info.seatk ?? '';
    } catch {}
    if (!seatVal) seatVal = `${m[1]}-P*3800`;
    out.push({ title: m[1] as string, seatVal, seatK, price: seatVal.split('*')[1] ?? '3800' });
  }
  return out;
}

/** parse Netscape cookie jar file (จาก curl -c) เป็น name/value pairs */
function parseNetscapeJar(content: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  for (const line of content.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length >= 7) out.push({ name: parts[5] as string, value: parts[6] as string });
  }
  return out;
}

/**
 * curl-first booking ถึงขั้น validateseat (lock ที่นั่งใน session)
 * คืน jar ล่าสุดสำหรับ hand-off ไป Firefox payment
 */
export function curlBook(opts: {
  zonesUrl: string;
  code: string;
  quantity?: number;
  cookies?: StoredCookie[];
}): CurlBookResult {
  const cookies = opts.cookies ?? loadCookies();
  const ck = buildCookieHeader(cookies, 'booking.thaiticketmajor.com');
  if (!ck) {
    return { ok: false, step: 'zones', k: '', round: '', zone: opts.code, seats: [], error: 'empty cookie jar — login first', jar: cookies };
  }
  const q = new URL(opts.zonesUrl).searchParams.get('query') ?? '';
  const qty = opts.quantity ?? 1;

  // STEP 1: zones.php — ลอง jar ก่อน; ถ้า 403 แปลว่า cookie เก่า score ตก
  // (พิสูจน์ 2026-09-04: no-cookie 200 แต่ jar เก่า 403) → retry แบบไม่ส่ง cookie
  let z = curlReq(opts.zonesUrl, { 'Cookie': ck, 'User-Agent': UA_CURL });
  let freshSession = false;
  if (z.code !== '200' || z.body.includes('Access Denied')) {
    z = curlReq(opts.zonesUrl, { 'User-Agent': UA_CURL });
    freshSession = true;
    if (z.code !== '200' || z.body.includes('Access Denied')) {
      return { ok: false, step: 'zones', k: '', round: '', zone: opts.code, seats: [], error: `zones http ${z.code}${z.body.includes('Access Denied') ? ' Access Denied (with and without jar)' : ''}`, jar: cookies };
    }
  }
  const k = extractK(z.body);
  const rounds = extractRounds(z.body);
  if (!k || rounds.length === 0) {
    return { ok: false, step: 'zones', k, round: '', zone: opts.code, seats: [], error: 'no k/round — sale not open', jar: cookies };
  }
  const round = rounds[0] as string;
  // ถ้า fresh session (ยิง no-cookie) — cookie ใหม่ที่ server Set-Cookie มาอยู่ใน jar
  // ของ curl; สกัดเป็น header ต่อใช้กับ fixed/validateseat
  let stepCookie = ck;
  if (freshSession && z.jarContent) {
    const fresh = parseNetscapeJar(z.jarContent);
    if (fresh.length) {
      stepCookie = fresh.map(c => `${c.name}=${c.value}`).join('; ');
    }
  }

  // STEP 2: fixed.php (Referer = zones จำเป็น กัน errcode=9)
  const fixedUrl = `https://booking.thaiticketmajor.com/booking/3m/fixed.php?k=${encodeURIComponent(k)}&zone=${encodeURIComponent(opts.code)}&round=${encodeURIComponent(round as string)}`;
  const f = curlReq(fixedUrl, {
    'Cookie': stepCookie, 'User-Agent': UA_CURL,
    'Referer': opts.zonesUrl,
  });
  if (f.code !== '200' || !f.body.includes('id="tableseats"') || f.body.includes('Access Denied') || f.body.includes('errcode=9')) {
    return { ok: false, step: 'fixed', k, round, zone: opts.code, seats: [], error: `fixed http ${f.code} tableseats=${f.body.includes('id="tableseats"')} err9=${f.body.includes('errcode=9')}`, jar: cookies };
  }
  const allSeats = parseSeats(f.body);
  if (allSeats.length < qty) {
    return { ok: false, step: 'fixed', k, round, zone: opts.code, seats: allSeats, error: `free seats ${allSeats.length} < ${qty}`, jar: cookies };
  }
  const picks = allSeats.slice(0, qty);

  // STEP 3: validateseat.php ต่อที่นั่ง (ล็อคใน session)
  const frm = f.body.match(/<form[^>]*id="frmPayment"[^>]*>([\s\S]*?)<\/form>/i);
  const payload: Record<string, string> = {};
  if (frm) {
    for (const im of (frm[1] as string).matchAll(/<input[^>]*>/gi)) {
      const nm = im[0].match(/name="([^"]+)"/)?.[1];
      if (nm) payload[nm] = im[0].match(/value="([^"]*)"/)?.[1] ?? '';
    }
  }
  payload['ehId'] = payload['ehId'] || q;
  payload['zone'] = opts.code;
  payload['rdId'] = round;
  let data = Object.entries(payload).map(([a, b]) => `${encodeURIComponent(a)}=${encodeURIComponent(b)}`).join('&');
  for (const s of picks) data += `&chkSeats%5B%5D=${encodeURIComponent(s.seatVal)}`;
  const first = (picks[0] as CurlSeat).title.split('-');
  data += `&row=${encodeURIComponent(first[0] ?? '')}&seat=${encodeURIComponent(first[1] ?? '')}&book_type=fix`;

  const vUrl = `https://booking.thaiticketmajor.com/booking/3m/validateseat.php?k=${encodeURIComponent(k)}&zw=${encodeURIComponent(opts.code)}`;
  const v = curlReq(vUrl, {
    'Cookie': stepCookie, 'User-Agent': UA_CURL,
    'Referer': fixedUrl,
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
  }, data);
  let vOk = false;
  try { vOk = v.code === '200' && JSON.parse(v.body)?.result === true; } catch {}
  if (!vOk) {
    return { ok: false, step: 'validateseat', k, round, zone: opts.code, seats: picks, error: `validateseat http ${v.code} body=${v.body.slice(0, 120)}`, jar: cookies };
  }

  return { ok: true, step: 'done', k, round, zone: opts.code, seats: picks, jar: cookies };
}
