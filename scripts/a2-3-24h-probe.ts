/**
 * A2-3 24h stability probe — วัดงาน 2 endpoint (concert + zones) + fixed เก็บ JSONL
 * ใช้ curl hygiene แบบเดียวกับ A2-1: concert = no cookie, zones/fixed = full jar + Referer
 * - concert ทุก 10 นาที (6/h = 144/24h)
 * - zones ทุก 15 นาที (4/h = 96/24h) สลับ 3 queries ตัวอย่าง (504, 650, 747)
 * - fixed ทุก 30 นาที (2/h = 48/24h) query 504 D1 round จาก zones
 * รวม ~12 req/h, 288 req/24h (ห่างจาก safe budget 60-180/h มาก)
 *
 * Run:  npx tsx scripts/a2-3-24h-probe.ts [--once] [--duration 24h] [--out .wayfinder/reports/a2-3-probe.jsonl]
 *       --once = ยิง 1 รอบของแต่ละ endpoint แล้วจบ (ใช้ verify hygiene ไม่ต้องรอ 24h)
 * Output JSONL: {ts, endpoint, query?, status, bytes, ms, ok, detail}
 * Summary เมื่อจบ 24h: pass% per endpoint + deny windows
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const UA_CURL = 'curl/8.0.1';
const OUT_DEFAULT = '.wayfinder/reports/a2-3-probe.jsonl';
const CONCERT_URL = 'https://www.thaiticketmajor.com/concert/';
const ZONES_QUERIES = ['504', '650', '747']; // 3 ตัวอย่าง: idol1st / อีก 2 จาก discover-cache
const FIXED_QUERY = '504';
const FIXED_ZONE = 'D1';

function parseArgs() {
  const a = process.argv.slice(2);
  const once = a.includes('--once') || a.includes('--dry') || a.includes('--quick');
  let durationMs = 24 * 3600 * 1000;
  let out = OUT_DEFAULT;
  for (const x of a) {
    if (x.startsWith('--duration')) {
      const v = x.split('=')[1] ?? a[a.indexOf(x)+1];
      if (v) durationMs = parseDuration(v);
    }
    if (x.startsWith('--out')) {
      const v = x.split('=')[1] ?? a[a.indexOf(x)+1];
      if (v) out = v;
    }
  }
  return { once, durationMs, out };
}
function parseDuration(s: string): number {
  s = s.trim();
  if (s.endsWith('h')) return Number(s.slice(0,-1))*3600*1000;
  if (s.endsWith('m')) return Number(s.slice(0,-1))*60*1000;
  if (s.endsWith('s')) return Number(s.slice(0,-1))*1000;
  const n = Number(s); return Number.isFinite(n) ? n*1000 : 24*3600*1000;
}
function jitter(ms: number, pct = 0.2): number {
  const r = (Math.random()*2-1)*pct; // -pct..+pct
  return Math.round(ms*(1+r));
}
function sleep(ms: number): Promise<void>{ return new Promise(r=>setTimeout(r, ms)); }

let cookieJar = '';
let cookieLoadedAt = 0;
function getCookieHeader(host: string): string {
  // lazy load + refresh every 2h
  if (!cookieJar || Date.now()-cookieLoadedAt > 2*3600*1000) {
    try {
      const { buildCookieHeader, loadCookies } = require('../src/cookies.js');
      // dynamic import for tsx compatibility — fallback to require
      const m = (()=>{ try{ return require('../src/cookies.js'); } catch{ return null; } })();
      if (m) {
        const ck = m.loadCookies();
        cookieJar = m.buildCookieHeader(ck, host);
        cookieLoadedAt = Date.now();
      }
    } catch {}
    if (!cookieJar) {
      try {
        const { loadCookies, buildCookieHeader } = (()=>{ try{ return require('../src/cookies.js'); } catch{ return { loadCookies:()=>[], buildCookieHeader:() => ''}; } })() as any;
      } catch {}
    }
  }
  // if still empty, try direct read
  if (!cookieJar) {
    try {
      const p = join(process.env.APPDATA ?? '', '..', '.bot-budcon-data', 'cookies.json');
      // attempt to build manually — fallback just return empty for concert, but for booking we need jar
      const { buildCookieHeader, loadCookies } = (awaitImportCookies() as any);
      const cks = loadCookies();
      cookieJar = buildCookieHeader(cks, host);
      cookieLoadedAt = Date.now();
    } catch {}
  }
  return cookieJar;
}
function awaitImportCookies(): any {
  try { return require('../src/cookies.js'); } catch { return { loadCookies:()=>[], buildCookieHeader: (a:any,b:string)=>'' }; }
}
// simpler: directly use buildCookieHeader from src via import at top — tsx handles it. So define at call site.
import { buildCookieHeader, loadCookies } from '../src/cookies.js';
function jarFor(host: string): string {
  if (!cookieJar || Date.now()-cookieLoadedAt > 2*3600*1000) {
    const cks = loadCookies();
    // keep full jar cached; strip per-host at call site but we store full for booking
    cookieJar = buildCookieHeader(cks, 'booking.thaiticketmajor.com');
    cookieLoadedAt = Date.now();
    console.log(`[probe] jar refreshed: ${cookieJar.length} chars PHPSESSID=${cookieJar.includes('PHPSESSID')} _abck=${cookieJar.includes('_abck')}`);
  }
  if (host.startsWith('www.')) return ''; // public host hygiene: no cookie
  return cookieJar;
}

function curlProbe(url: string, headers: Record<string,string>): { status: number; bytes: number; body: string; ms: number } {
  const tmp = join(tmpdir(), `a23-${Date.now()}-${Math.random().toString(36).slice(2,5)}.html`);
  const hdr = join(tmpdir(), `a23-hdr-${Date.now()}-${Math.random().toString(36).slice(2,5)}.txt`);
  let cmd = `curl -s -D "${hdr}" --compressed --max-time 25 -o "${tmp}" -w "%{http_code}"`;
  for (const [k,v] of Object.entries(headers)) {
    const safe = v.replace(/"/g, '\\"');
    cmd += ` -H "${k}: ${safe}"`;
  }
  cmd += ` "${url}"`;
  const t0 = Date.now();
  let code = '0';
  let body = '';
  try {
    code = execSync(cmd, { encoding: 'utf-8', timeout: 30_000 }).trim();
    body = readFileSync(tmp, 'utf-8');
  } catch (e: any) {
    try { body = readFileSync(tmp, 'utf-8'); } catch {}
    const msg = String(e?.message ?? e);
    const m = msg.match(/\"([0-9]{3})\"/);
    if (m) code = m[1];
  } finally {
    try { execSync(`rm -f "${tmp}" "${hdr}"`); } catch {}
  }
  const ms = Date.now()-t0;
  return { status: Number(code)||0, bytes: body.length, body, ms };
}

interface Entry { ts: string; epoch: number; endpoint: string; query?: string; status: number; bytes: number; ms: number; ok: boolean; detail: string; ua: string; }

function isOkConcert(r: {status:number; body:string}): {ok:boolean; detail:string} {
  if (r.status !== 200) return { ok:false, detail: `http ${r.status}` };
  if (r.body.includes('Access Denied') || r.body.includes('Reference #')) return { ok:false, detail: 'WAF Access Denied' };
  const hits = (r.body.match(/zones\.php\?query=/g) ?? []).length;
  const hasConcert = r.body.includes('/concert/');
  if (hits < 1) return { ok:false, detail: `no query hits len=${r.body.length}` };
  return { ok:true, detail: `hits=${hits} hasConcert=${hasConcert}` };
}
function isOkZones(r: {status:number; body:string}): {ok:boolean; detail:string} {
  if (r.status !== 200) return { ok:false, detail: `http ${r.status}` };
  if (r.body.includes('Access Denied') || r.body.includes('Reference #')) return { ok:false, detail: 'WAF Access Denied' };
  if (r.body.length < 400 && /url=\s*\/?user\/signin\.php/i.test(r.body)) return { ok:false, detail: '71B signin bounce' };
  const anchors = (r.body.match(/#fixed\.php#/g) ?? []).length;
  const hasK = r.body.includes('name="k"');
  if (!hasK) return { ok:false, detail: `no k len=${r.body.length}` };
  return { ok:true, detail: `anchors=${anchors} hasK=${hasK}` };
}
function isOkFixed(r: {status:number; body:string}): {ok:boolean; detail:string} {
  if (r.status !== 200) return { ok:false, detail: `http ${r.status}` };
  if (r.body.includes('Access Denied') || r.body.includes('Reference #')) return { ok:false, detail: 'WAF Access Denied' };
  if (r.body.includes('errcode=9') || r.body.includes('error.php')) return { ok:false, detail: 'errcode=9' };
  if (r.body.length < 400 && /url=\s*\/?user\/signin\.php/i.test(r.body)) return { ok:false, detail: 'signin bounce' };
  const hasTable = r.body.includes('id="tableseats"');
  const free = (r.body.match(/seatuncheck/g) ?? []).length;
  if (!hasTable) return { ok:false, detail: `no tableseats len=${r.body.length}` };
  return { ok:true, detail: `tableseats free=${free}` };
}

function extractKZones(body: string): {k:string; rounds:string[]} {
  const kM = body.match(/<input[^>]*name="k"[^>]*value="([^"]+)"/i) ?? body.match(/<input[^>]*value="([^"]+)"[^>]*name="k"/i);
  const k = kM?.[1] ?? '';
  const sel = body.match(/<select[^>]*id="rdId"[^>]*>([\s\S]*?)<\/select>/i);
  const rounds = sel ? [...sel[1].matchAll(/<option[^>]*value="(\d+)"[^>]*>/gi)].map(m=>m[1]).filter(v=>v!=='0'&&v!=='000') : [];
  return {k, rounds};
}

async function runOnce(outPath: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  const now = () => Date.now();
  // concert
  {
    const r = curlProbe(CONCERT_URL, { 'User-Agent': UA_CURL, 'Accept': 'text/html,*/*', 'Accept-Language': 'th,en-US;q=0.9' });
    const {ok, detail} = isOkConcert(r);
    const e: Entry = { ts: new Date().toISOString(), epoch: now(), endpoint: 'concert', status: r.status, bytes: r.bytes, ms: r.ms, ok, detail, ua: UA_CURL };
    entries.push(e);
    console.log(`[concert] ${r.status} ${r.bytes}B ${r.ms}ms ok=${ok} ${detail}`);
  }
  // zones 3 queries
  for (const q of ZONES_QUERIES) {
    const url = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${q}`;
    const ck = jarFor('booking.thaiticketmajor.com');
    const r = curlProbe(url, { 'User-Agent': UA_CURL, 'Cookie': ck, 'Referer': 'https://www.thaiticketmajor.com/', 'Accept': 'text/html,*/*', 'Accept-Language': 'th,en-US;q=0.9' });
    const {ok, detail} = isOkZones(r);
    const e: Entry = { ts: new Date().toISOString(), epoch: now(), endpoint: 'zones', query: q, status: r.status, bytes: r.bytes, ms: r.ms, ok, detail, ua: UA_CURL };
    entries.push(e);
    console.log(`[zones q=${q}] ${r.status} ${r.bytes}B ${r.ms}ms ok=${ok} ${detail}`);
    await sleep(800); // spacing to avoid burst
  }
  // fixed one
  {
    const q = FIXED_QUERY;
    const url = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${q}`;
    const ck = jarFor('booking.thaiticketmajor.com');
    let zBody = '';
    try {
      const zr = curlProbe(url, { 'User-Agent': UA_CURL, 'Cookie': ck, 'Referer': 'https://www.thaiticketmajor.com/', 'Accept': 'text/html,*/*' });
      zBody = zr.body;
    } catch {}
    const {k, rounds} = extractKZones(zBody);
    if (k && rounds.length) {
      const round = rounds[0];
      const fixedUrl = `https://booking.thaiticketmajor.com/booking/3m/fixed.php?k=${encodeURIComponent(k)}&zone=${encodeURIComponent(FIXED_ZONE)}&round=${encodeURIComponent(round)}`;
      const referer = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${q}`;
      const r = curlProbe(fixedUrl, { 'User-Agent': UA_CURL, 'Cookie': ck, 'Referer': referer, 'Accept': 'text/html,*/*' });
      const {ok, detail} = isOkFixed(r);
      const e: Entry = { ts: new Date().toISOString(), epoch: now(), endpoint: 'fixed', query: `${q}/${FIXED_ZONE}/${round}`, status: r.status, bytes: r.bytes, ms: r.ms, ok, detail, ua: UA_CURL };
      entries.push(e);
      console.log(`[fixed ${FIXED_ZONE}/${round}] ${r.status} ${r.bytes}B ${r.ms}ms ok=${ok} ${detail}`);
    } else {
      const e: Entry = { ts: new Date().toISOString(), epoch: now(), endpoint: 'fixed', query: `${q}/${FIXED_ZONE}`, status: 0, bytes: 0, ms: 0, ok:false, detail: `skip no k/round k=${k ? 'yes' : 'no'} rounds=${rounds.length}`, ua: UA_CURL };
      entries.push(e);
      console.log(`[fixed] skip no k/round`);
    }
  }
  // write
  for (const e of entries) appendFileSync(outPath, JSON.stringify(e)+'\n', 'utf-8');
  return entries;
}

function summarize(outPath: string) {
  if (!existsSync(outPath)) { console.log('no jsonl yet'); return; }
  const lines = readFileSync(outPath,'utf-8').trim().split('\n').filter(Boolean);
  const rows: Entry[] = lines.map(l=> JSON.parse(l));
  const byEp: Record<string, Entry[]> = {};
  for (const r of rows) (byEp[r.endpoint] ??= []).push(r);
  console.log(`\n=== SUMMARY ${rows.length} entries ===`);
  for (const [ep, arr] of Object.entries(byEp)) {
    const ok = arr.filter(x=>x.ok).length;
    const pct = arr.length ? (ok/arr.length*100).toFixed(1) : '0.0';
    const denies = arr.filter(x=>!x.ok).slice(0,5).map(x=> `${x.ts.slice(11,19)} ${x.detail}`);
    console.log(`${ep}: ${ok}/${arr.length} = ${pct}% ${arr.length?'| sample denies: '+(denies.join(' ; ')||'none'):''}`);
  }
  const allOk = rows.filter(x=>x.ok).length;
  console.log(`overall: ${allOk}/${rows.length} = ${(allOk/Math.max(1,rows.length)*100).toFixed(1)}%`);
  const need95 = Object.values(byEp).every(arr=> arr.length===0 || arr.filter(x=>x.ok).length/arr.length >= 0.95);
  console.log(need95 ? '✅ ≥95% per endpoint PASS' : '❌ <95% FAIL');
}

async function main() {
  const {once, durationMs, out} = parseArgs();
  const outPath = resolve(out);
  mkdirSync(dirname(outPath), { recursive: true });
  console.log(`A2-3 probe — ${once ? 'ONCE' : `24h loop ${Math.round(durationMs/3600000)}h`} → ${outPath}`);
  console.log(`intervals: concert 10m zones 15m fixed 30m (±20% jitter) total ~12/h ~288/24h`);
  // jar preview
  try {
    const cks = loadCookies(); const preview = buildCookieHeader(cks,'booking.thaiticketmajor.com');
    console.log(`jar: ${preview.length} chars PHPSESSID=${preview.includes('PHPSESSID')} _abck=${preview.includes('_abck')} bm_sv=${preview.includes('bm_sv')}`);
  } catch (e:any){ console.log('jar load failed', e.message); }

  if (once) {
    await runOnce(outPath);
    summarize(outPath);
    return;
  }
  const t0 = Date.now();
  const tend = t0 + durationMs;
  let nextConcert = t0;
  let nextZones = t0 + 30_000; // stagger
  let nextFixed = t0 + 60_000;
  let cycles = 0;
  while (Date.now() < tend) {
    const now = Date.now();
    if (now >= nextConcert) {
      const r = curlProbe(CONCERT_URL, { 'User-Agent': UA_CURL });
      const {ok, detail} = isOkConcert(r);
      const e: Entry = { ts: new Date().toISOString(), epoch: now, endpoint:'concert', status:r.status, bytes:r.bytes, ms:r.ms, ok, detail, ua: UA_CURL };
      appendFileSync(outPath, JSON.stringify(e)+'\n','utf-8');
      console.log(`[${new Date().toISOString().slice(11,19)} concert] ${r.status} ${r.bytes}B ${r.ms}ms ok=${ok} ${detail}`);
      nextConcert = now + jitter(10*60*1000);
    }
    if (now >= nextZones) {
      for (const q of ZONES_QUERIES) {
        const ck = jarFor('booking.thaiticketmajor.com');
        const url = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${q}`;
        const r = curlProbe(url, { 'User-Agent': UA_CURL, 'Cookie': ck, 'Referer':'https://www.thaiticketmajor.com/' });
        const {ok, detail} = isOkZones(r);
        const e: Entry = { ts:new Date().toISOString(), epoch: Date.now(), endpoint:'zones', query:q, status:r.status, bytes:r.bytes, ms:r.ms, ok, detail, ua:UA_CURL };
        appendFileSync(outPath, JSON.stringify(e)+'\n','utf-8');
        console.log(`[${new Date().toISOString().slice(11,19)} zones q=${q}] ${r.status} ${r.bytes}B ok=${ok} ${detail}`);
        await sleep(900);
      }
      nextZones = now + jitter(15*60*1000);
    }
    if (now >= nextFixed) {
      try {
        const ck = jarFor('booking.thaiticketmajor.com');
        const zUrl = `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${FIXED_QUERY}`;
        const zr = curlProbe(zUrl, { 'User-Agent': UA_CURL, 'Cookie': ck, 'Referer':'https://www.thaiticketmajor.com/' });
        const {k, rounds} = extractKZones(zr.body);
        if (k && rounds.length) {
          const round = rounds[0];
          const fUrl = `https://booking.thaiticketmajor.com/booking/3m/fixed.php?k=${encodeURIComponent(k)}&zone=${FIXED_ZONE}&round=${round}`;
          const fr = curlProbe(fUrl, { 'User-Agent': UA_CURL, 'Cookie': ck, 'Referer': `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${FIXED_QUERY}` });
          const {ok, detail} = isOkFixed(fr);
          const e: Entry = { ts:new Date().toISOString(), epoch:Date.now(), endpoint:'fixed', query:`${FIXED_QUERY}/${FIXED_ZONE}/${round}`, status:fr.status, bytes:fr.bytes, ms:fr.ms, ok, detail, ua:UA_CURL };
          appendFileSync(outPath, JSON.stringify(e)+'\n','utf-8');
          console.log(`[${new Date().toISOString().slice(11,19)} fixed] ${fr.status} ${fr.bytes}B ok=${ok} ${detail}`);
        } else {
          console.log(`[fixed] skip no k`);
        }
      } catch(e:any){ console.log('[fixed] error', e.message); }
      nextFixed = now + jitter(30*60*1000);
    }
    cycles++;
    if (cycles % 10 === 0) summarize(outPath);
    const nextDue = Math.min(nextConcert, nextZones, nextFixed);
    const wait = Math.max(2000, nextDue - Date.now());
    await sleep(Math.min(wait, 30_000));
    if (Date.now() >= tend) break;
  }
  console.log('\n=== 24h DONE ==='); summarize(outPath);
}
main().catch(e=>{ console.error(e); process.exit(1); });
