/**
 * E2E probe: for each on-sale event, find a zone with seats available
 * (fixed.php seatuncheck > 0) without touching the cart.
 * Reports which event/zone the real booking test can use.
 */
import { loadCookies, buildCookieHeader } from '../src/cookies.js';
import { config } from '../src/config.js';

const EVENTS: Array<{ query: string; title: string }> = [
  { query: '650', title: 'BABYMONSTER (20 rounds!)' },
  { query: '747', title: 'Thailand Philharmonic' },
  { query: '504', title: 'IDOL1ST KENTY' },
  { query: '614', title: 'REMASTER' },
  { query: '698', title: 'KITA' },
  { query: '557', title: 'ROOKIE DIVOS' },
  { query: '704', title: 'วิบวับ STAGE SHOW' },
];

const cookies = loadCookies();
const ck = (host: string) => buildCookieHeader(cookies, host);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

async function fetchTtm(url: string, referer: string): Promise<{ status: number; body: string; finalUrl: string }> {
  // Use the BotEngine browser via request context — but lighter: try wreq first.
  try {
    const { fetch: wreqFetch } = await import('wreq-js');
    const r = await wreqFetch(url, {
      headers: { Cookie: ck(new URL(url).host) ?? '', Referer: referer, Accept: 'text/html,*/*' },
      timeout: 20_000,
    });
    const body = await r.text();
    if (r.status === 200 && body.length > 500 && !body.includes('Access Denied') && !body.includes('signin.php')) {
      return { status: r.status, body, finalUrl: url };
    }
  } catch { /* fall to fetch */ }
  const r2 = await fetch(url, {
    headers: { Cookie: ck(new URL(url).host) ?? '', Referer: referer, 'User-Agent': UA, Accept: 'text/html,*/*' },
    redirect: 'follow',
  });
  return { status: r2.status, body: await r2.text(), finalUrl: r2.url };
}

for (const ev of EVENTS) {
  try {
    const zonesRes = await fetchTtm(
      `https://booking.thaiticketmajor.com/booking/3m/zones.php?query=${ev.query}`,
      'https://www.thaiticketmajor.com/concert/',
    );
    if (zonesRes.body.length < 500 || zonesRes.body.includes('signin.php')) {
      console.log(`${ev.query} ${ev.title}: zones blocked (${zonesRes.body.length}B)`);
      continue;
    }
    const zoneMatches = [...zonesRes.body.matchAll(/#fixed\.php#([A-Z0-9]+)/g)].map((m) => m[1]!);
    const zones = [...new Set(zoneMatches)].slice(0, 4);
    if (zones.length === 0) { console.log(`${ev.query} ${ev.title}: no zone anchors`); continue; }

    // Need k + round
    const kM = zonesRes.body.match(/<input[^>]*name="k"[^>]*value="([^"]+)"/i)
      ?? zonesRes.body.match(/<input[^>]*value="([^"]+)"[^>]*name="k"/i);
    const k = kM?.[1] ?? '';
    const rdBlock = zonesRes.body.match(/<select[^>]*id="rdId"[^>]*>([\s\S]*?)<\/select>/i);
    const rdOpts = rdBlock
      ? [...rdBlock[1]!.matchAll(/<option[^>]*value="(\d+)"/gi)].map((m) => m[1]!).filter((v) => v !== '0' && v !== '000')
      : [];
    const round = rdOpts[rdOpts.length - 1] ?? ''; // last round = usually soonest/upcoming

    if (!k || !round) { console.log(`${ev.query} ${ev.title}: k=${k ? 'yes' : 'no'} round=${round || 'none'}`); continue; }

    let report = `${ev.query} ${ev.title} [round ${round}]:`;
    for (const zone of zones) {
      try {
        const fixed = await fetchTtm(
          `https://booking.thaiticketmajor.com/booking/3m/fixed.php?k=${encodeURIComponent(k)}&zone=${zone}&round=${round}`,
          `https://booking.thaiticketmajor.com/booking/3m/zones.php?rdId=${round}&k=${encodeURIComponent(k)}&query=${ev.query}`,
        );
        if (fixed.body.includes('errcode=9') || fixed.body.includes('error.php')) {
          report += ` ${zone}:not-open`;
          continue;
        }
        const avail = (fixed.body.match(/seatuncheck/g) ?? []).length;
        const taken = (fixed.body.match(/seatnotavail/g) ?? []).length;
        report += ` ${zone}:${avail} free/${taken} taken`;
        if (avail > 0) {
          const seats = [...fixed.body.matchAll(/<td[^>]*title="([A-Z0-9-]+)"[^>]*>\s*<div class="seatuncheck"/gi)].map((m) => m[1]!);
          report += ` (e.g. ${seats.slice(0, 3).join(',')})`;
          break;
        }
      } catch (e) { report += ` ${zone}:err`; }
    }
    console.log(report);
  } catch (e) {
    console.log(`${ev.query} ${ev.title}: ERROR ${e instanceof Error ? e.message.slice(0, 60) : e}`);
  }
}
