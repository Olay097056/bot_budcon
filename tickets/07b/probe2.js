// Re-verify the Chrome 146/149/152 200 path 3x and dump headers + cookies
const https = require('node:https');

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
];

function probe(ua) {
  return new Promise((resolve) => {
    const opts = {
      host: 'www.thaiticketmajor.com',
      port: 443,
      path: '/',
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
          status: res.statusCode,
          bodyLen: body.length,
          contentType: res.headers['content-type'],
          xAkamai: res.headers['x-akamai-transformed'] || res.headers['x-akamai-request-id'],
          altSvc: res.headers['alt-svc'],
          cookies: flat,
          hasAbck: flat.includes('_abck'),
          hasBmSz: flat.includes('bm_sz'),
          hasPhpsess: flat.includes('PHPSESSID'),
          title: (head.match(/<title>([^<]+)<\/title>/i) || [])[1] || '',
          dt_ms: Date.now() - t0,
        });
      });
    });
    req.on('error', e => resolve({ status: 'ERR', error: String(e.message) }));
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

(async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n===== ATTEMPT ${attempt} =====`);
    for (const ua of UAS) {
      const r = await probe(ua);
      console.log(`UA=${ua.slice(20, 60)}...  ` + JSON.stringify(r));
    }
  }
})();
