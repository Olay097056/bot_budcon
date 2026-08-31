// Phase-2 Akamai sensor recon probe.
// Raw node:https, no libraries. Captures status, body length, Set-Cookie names, and markers.
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const RAW_DIR = path.join(__dirname, 'raw');
fs.mkdirSync(RAW_DIR, { recursive: true });

const ENDPOINTS = [
  { name: 'homepage',      url: 'https://www.thaiticketmajor.com/concert/idol1st-kenty-asia-tour-2026-in-bangkok.html', host: 'www.thaiticketmajor.com' },
  { name: 'zones',         url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504',                host: 'booking.thaiticketmajor.com' },
  { name: 'view',          url: 'https://booking.thaiticketmajor.com/booking/3m/view.php?query=504',                 host: 'booking.thaiticketmajor.com' },
];

const MARKERS = [
  'sensor_data',
  '_abck',
  'bm_sz',
  'bm_mi',
  'akamai',
  'edgesuite',
  'akam',
  'pwhr',
];

function fetchOne({ url, host }, cookieHeader, label) {
  return new Promise((resolve) => {
    const headers = {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'identity',
      'Connection': 'close',
      'Host': host,
    };
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    const req = https.get(url, { headers, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const body = buf.toString('utf8');
        const setCookies = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]);
        resolve({
          label,
          status: res.statusCode,
          headers: res.headers,
          setCookies,
          bodyLen: body.length,
          body,
        });
      });
    });
    req.on('error', (e) => resolve({ label, status: 0, error: e.message, body: '', bodyLen: 0, setCookies: [] }));
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

function scanMarkers(body) {
  const hits = {};
  for (const m of MARKERS) {
    const re = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = body.match(re);
    hits[m] = matches ? matches.length : 0;
  }
  return hits;
}

function findVarChunks(body) {
  // Look for var a=...; var b=...; var c=...; patterns with substantial value length
  const re = /var\s+([a-z])\s*=\s*([^;]{60,})/gi;
  const out = [];
  let m;
  let i = 0;
  while ((m = re.exec(body)) && i < 10) {
    out.push({ var: m[1], len: m[2].length, sample: m[2].slice(0, 80) });
    i++;
  }
  return out;
}

function findScriptSrcs(body) {
  const re = /<script[^>]+src=["']([^"']+)["']/gi;
  const out = [];
  let m;
  while ((m = re.exec(body))) {
    const src = m[1];
    if (/akamai|edgesuite|bam\.nr-data|browser-validation|sensor|bot/i.test(src)) out.push(src);
  }
  return out;
}

async function main() {
  // Build cookie header from cookies.json
  let cookieHeader = null;
  let cookieNote = '';
  const cookiePath = 'C:/Users/bit-it.helpdesk/.bot-budcon-data/cookies.json';
  try {
    const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
    const realCookies = cookies.filter((c) => c.value && c.value !== 'live' && c.value.length > 4);
    cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    cookieNote = `cookie_file=${cookies.length} cookies (${realCookies.length} real)`;
  } catch (e) {
    cookieNote = `cookie_file_error=${e.message}`;
  }

  const results = [];

  for (const ep of ENDPOINTS) {
    // No cookies
    const noC = await fetchOne(ep, null, `${ep.name}-no-cookies`);
    const noCFile = path.join(RAW_DIR, `${ep.name}-no-cookies.html`);
    fs.writeFileSync(noCFile, noC.body);
    const noCMarkers = scanMarkers(noC.body);
    const noCVar = findVarChunks(noC.body);
    const noCScripts = findScriptSrcs(noC.body);
    results.push({
      endpoint: ep.name,
      url: ep.url,
      phase: 'no-cookies',
      cookieNote,
      status: noC.status,
      bodyLen: noC.bodyLen,
      setCookies: noC.setCookies,
      markers: noCMarkers,
      varChunks: noCVar,
      scriptSrcs: noCScripts,
      rawFile: path.relative(__dirname, noCFile),
      error: noC.error || null,
    });

    // With cookies
    const withC = await fetchOne(ep, cookieHeader, `${ep.name}-with-cookies`);
    const withCFile = path.join(RAW_DIR, `${ep.name}-with-cookies.html`);
    fs.writeFileSync(withCFile, withC.body);
    const withCMarkers = scanMarkers(withC.body);
    const withCVar = findVarChunks(withC.body);
    const withCScripts = findScriptSrcs(withC.body);
    results.push({
      endpoint: ep.name,
      url: ep.url,
      phase: 'with-cookies',
      cookieNote,
      status: withC.status,
      bodyLen: withC.bodyLen,
      setCookies: withC.setCookies,
      markers: withCMarkers,
      varChunks: withCVar,
      scriptSrcs: withCScripts,
      rawFile: path.relative(__dirname, withCFile),
      error: withC.error || null,
    });
  }

  fs.writeFileSync(path.join(__dirname, 'probe-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
