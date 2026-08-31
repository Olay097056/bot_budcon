// Probe thaiticketmajor.com with one User-Agent, capture status, body length,
// edgesuite signal. No cookies, no sensor_data, no login. One TLS handshake.

const https = require('node:https');

const uas = process.argv.slice(2);
if (uas.length === 0) {
  console.error('usage: node probe.js "<ua1>" "<ua2>" ...');
  process.exit(2);
}

const HOST = 'www.thaiticketmajor.com';
const PATH = '/';
const PORT = 443;

const EDGE_RE = /edgesuite|akamai|bot[- ]?manager|access denied|errors\.edgesuite|bm_sz|_abck/i;

function probeOne(ua, idx) {
  return new Promise((resolve) => {
    const opts = {
      host: HOST,
      port: PORT,
      path: PATH,
      method: 'GET',
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'Connection': 'close',
      },
      servername: HOST,
      rejectUnauthorized: true,
    };

    let body = Buffer.alloc(0);
    const t0 = Date.now();

    const req = https.request(opts, (res) => {
      res.on('data', (chunk) => {
        if (body.length < 16384) body = Buffer.concat([body, chunk]);
      });
      res.on('end', () => {
        const head = body.slice(0, 4096).toString('utf8');
        const dt = Date.now() - t0;
        const edgesuite = EDGE_RE.test(head) || /errors\.edgesuite\.net/.test(head);
        const refMatch = head.match(/Reference\s*&#?\w*;?\s*#?\s*\d+\.\w+\.\d+\.\w+/);
        const ref = refMatch ? refMatch[0].replace(/&#\d+;/g, '').replace(/&[#\w]+;/g, '').trim() : null;
        const abck = /_abck/.test(head);
        resolve({
          idx,
          ua,
          status: res.statusCode,
          bodyLen: body.length,
          edgesuite,
          ref,
          abck,
          dt_ms: dt,
          snippet: head.slice(0, 220).replace(/\s+/g, ' '),
        });
      });
    });
    req.on('error', (err) => {
      resolve({ idx, ua, status: 'ERR', error: String(err.message || err), edgesuite: false });
    });
    req.setTimeout(8000, () => {
      req.destroy(new Error('timeout'));
    });
    req.end();
  });
}

(async () => {
  const out = [];
  // Sequential to avoid hammering TTM (and to keep the probe single-connection per UA)
  for (let i = 0; i < uas.length; i++) {
    const r = await probeOne(uas[i], i);
    out.push(r);
    console.log(JSON.stringify(r));
  }
  // Aggregate on stdout for the parent to parse
  console.log('---SUMMARY---');
  console.log(JSON.stringify(out));
})();
