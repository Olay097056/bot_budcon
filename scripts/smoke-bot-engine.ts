// Smoke test for ticket 02: bot engine.
// Goal: fetch the TTM concert page (the URL that hit Akamai 407 in
// the previous session) via wreq-js and prove Phase-1 lands.
import { BotEngine } from '../src/bot-engine.js';

async function main(): Promise<void> {
  const engine = new BotEngine();
  try {
    const urls = [
      'https://www.thaiticketmajor.com/',
      'https://www.thaiticketmajor.com/concert/idol1st-kenty-asia-tour-2026-in-bangkok.html',
      'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504',
    ];
    for (const url of urls) {
      const r = await engine.fetchViaWreq(url);
      console.log(JSON.stringify({
        url,
        status: r.status,
        bodyLen: r.body.length,
        setCookie: r.headers['set-cookie']?.slice(0, 60),
        contentType: r.headers['content-type']?.slice(0, 40),
      }, null, 2));
    }
  } finally {
    await engine.close();
  }
}

main().catch((e: unknown) => {
  console.error('FATAL:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
