// Probe 131/120/firefox/safari UAs again (for comparison) + probe a listing page
const https = require('node:https');

const UAS = [
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',  // new control
];

function probe(ua, path) {
  return new Promise((resolve) => {
    const opts = {
      host: 'www.thaiticketmajor.com',
      port: 443,
      path,
      method: 'GET',
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'close',
      },
      servername: 'www.thaiticketmajor.com',
    };
    let body = Buffer.alloc(0);
    const t0 = Date.now();
    const req = https.request(opts, (res) => {
      res.on('data', (chunk) => { if (body.length < 16384) body = Buffer.concat([body, chunk]); });
      res.on('end', () => {
        const head = body.slice(0, 2048).toString('utf8');
        const sc = res.headers['set-cookie'] || [];
        const flat = sc.map(c => c.split(';')[0]).join(' | ');
        resolve({
          ua: ua.slice(20, 70),
          path,
          status: res.statusCode,
          bodyLen: body.length,
          cookies: flat,
          hasAbck: flat.includes('_abck'),
          hasBmSz: flat.includes('bm_sz'),
          hasAkBmsc: flat.includes('ak_bmsc'),
          hasBmMi: flat.includes('bm_mi'),
          ref: (head.match(/Reference[^<]*?(\d+\.\w+\.\d+\.\w+)/) || [])[1] || null,
          dt_ms: Date.now() - t0,
        });
      });
    });
    req.on('error', e => resolve({ ua: ua.slice(20, 70), path, status: 'ERR', error: String(e.message) }));
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

(async () => {
  // 1. Repeat the older UAs against /
  console.log('=== HOMEPAGE / (older UAs vs new) ===');
  for (const ua of UAS) {
    const r = await probe(ua, '/');
    console.log(JSON.stringify(r));
  }
  // 2. Listing page with Chrome 146 (the new "good" UA)
  console.log('\n=== LISTING /search.html (Chrome 146) ===');
  const r = await probe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', '/search.html');
  console.log(JSON.stringify(r));
  console.log('\n=== LISTING /search.html (curl UA control) ===');
  const r2 = await probe('curl/8.0.0', '/search.html');
  console.log(JSON.stringify(r2));
  console.log('\n=== LISTING /view/home/main/ (Chrome 146) ===');
  const r3 = await probe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', '/view/home/main/');
  console.log(JSON.stringify(r3));
})();
