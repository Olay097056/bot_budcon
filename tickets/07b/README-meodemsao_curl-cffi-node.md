# curl-cffi-node

> **Node.js HTTP client with browser TLS/JA3/HTTP2 fingerprint impersonation** — powered by [curl-impersonate](https://github.com/lexiforest/curl-impersonate) via [napi-rs](https://napi.rs).

[![npm version](https://img.shields.io/npm/v/curl-cffi-node.svg?color=cb3837&logo=npm)](https://www.npmjs.com/package/curl-cffi-node)
[![npm downloads](https://img.shields.io/npm/dm/curl-cffi-node.svg?color=blue&logo=npm)](https://www.npmjs.com/package/curl-cffi-node)
[![Publish](https://github.com/meodemsao/curl-cffi-node/actions/workflows/publish.yml/badge.svg)](https://github.com/meodemsao/curl-cffi-node/actions/workflows/publish.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20windows-lightgrey.svg)](#supported-platforms)

Bypass TLS fingerprinting, JA3 detection, and HTTP/2 fingerprinting used by Cloudflare, Akamai, and other anti-bot systems. `curl-cffi-node` impersonates real browsers at the TLS and HTTP/2 protocol level — not just User-Agent strings.

---

## Table of Contents

- [Features](#features)
- [Why curl-cffi-node?](#why-curl-cffi-node)
- [🌐 Live Demo & Fingerprint Tool](#-live-demo--fingerprint-tool)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
  - [Simple Requests](#simple-requests)
  - [Session with Browser Impersonation](#session-with-browser-impersonation)
  - [POST with JSON Body](#post-with-json-body)
  - [Custom Headers & Query Parameters](#custom-headers--query-parameters)
  - [Cookie Management](#cookie-management)
  - [Proxy Support](#proxy-support)
  - [WebSocket with Impersonated TLS](#websocket-with-impersonated-tls)
  - [Custom TLS Fingerprint](#custom-tls-fingerprint)
  - [Streaming Response](#streaming-response)
  - [Async Concurrent Requests](#async-concurrent-requests)
  - [Low-Level Curl Handle](#low-level-curl-handle)
- [API Reference](#api-reference)
  - [Session](#session)
  - [Response](#response)
  - [CurlWebSocket](#curlwebsocket)
  - [Error Hierarchy](#error-hierarchy)
  - [Shorthand Functions](#shorthand-functions)
- [Browser Impersonation Targets](#browser-impersonation-targets)
- [Supported Platforms](#supported-platforms)
- [Performance](#performance)
- [Building from Source](#building-from-source)
- [Testing](#testing)
- [Comparison](#comparison)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- 🎭 **Browser Impersonation** — Chrome, Safari, Firefox, Edge TLS/JA3/HTTP2 fingerprints
- 🔒 **TLS Fingerprint Matching** — Exact JA3 hash reproduction for anti-bot bypass
- 🌐 **HTTP/2 Fingerprinting** — SETTINGS, WINDOW_UPDATE, PRIORITY frames match real browsers
- 🍪 **Cookie Persistence** — Automatic cookie jar with import/export (Netscape format)
- ♻️ **Connection Reuse** — Persistent handles for keep-alive and connection pooling
- 🔌 **WebSocket** — WebSocket connections with impersonated TLS handshakes
- ⚡ **Async I/O** — Non-blocking `performAsync()` via thread pool (no event loop blocking)
- 🌍 **Proxy Support** — HTTP, HTTPS, SOCKS4, SOCKS5 with authentication
- 📡 **Streaming** — Node.js `Readable` stream responses for large downloads
- 🛡️ **Typed Errors** — `TimeoutError`, `ConnectionError`, `TLSError`, `ProxyError`
- 📦 **Zero Dependencies** — Prebuilt native binaries, no runtime dependencies
- 🔄 **Dual Format** — ESM and CommonJS support with TypeScript declarations

---

## Why curl-cffi-node?

Traditional HTTP clients (`node-fetch`, `axios`, `undici`) create **identifiable TLS fingerprints** that anti-bot systems detect instantly. Changing the User-Agent header alone is not enough — modern bot detection analyzes:

| Detection Layer | What They Check | Regular HTTP Clients | curl-cffi-node |
|---|---|---|---|
| **TLS Fingerprint (JA3)** | Cipher suites, extensions, elliptic curves | ❌ Node.js default | ✅ Matches Chrome/Safari |
| **HTTP/2 Fingerprint** | SETTINGS, WINDOW_UPDATE, PRIORITY frames | ❌ Generic | ✅ Matches target browser |
| **Header Order** | Order of HTTP headers in request | ❌ Alphabetical | ✅ Matches browser order |
| **TLS Extensions** | ALPN, SNI, supported groups | ❌ Node.js/OpenSSL | ✅ Browser-identical |

---

## 🌐 Live Demo & Fingerprint Tool

**Try it now** → [**curl-cffi-node.pages.dev**](https://curl-cffi-node.pages.dev)

We built an interactive website where you can:

### 🔍 Fingerprint Inspector

See your browser's **exact TLS and HTTP/2 fingerprint** in real time:

- **JA3 / JA4 Hash** — The TLS ClientHello fingerprint that anti-bot systems use to identify you
- **Akamai H2 Fingerprint** — HTTP/2 SETTINGS + WINDOW_UPDATE + PRIORITY frame fingerprint
- **HTTP/2 Settings** — ENABLE_PUSH, MAX_CONCURRENT_STREAMS, INITIAL_WINDOW_SIZE, etc.
- **TLS Extensions & Cipher Suites** — Full list of what your browser negotiates
- **Ready-to-use code** — Auto-generated `curl-cffi-node` code snippet with your exact fingerprint values

### 🤝 Community Fingerprint Database

Contribute your browser's fingerprint to help build the **largest open-source fingerprint database**:

- **Auto-detection** — Browser name, version, OS, and device type are parsed from your User-Agent
- **One-click submit** — Captured fingerprint is auto-attached; just click "Contribute"
- **Powered by Cloudflare D1** — All submissions stored in a SQLite edge database
- **Public API** — Query fingerprints via `GET /api/fingerprints`

### API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/capture` | `GET` | Capture TLS/HTTP2 fingerprint (proxy to avoid CORS) |
| `/api/fingerprints` | `GET` | List contributed fingerprints (`?limit=50&offset=0`) |
| `/api/fingerprints` | `POST` | Submit a new fingerprint with metadata |

**Tech stack**: Astro + Svelte + TailwindCSS, deployed on Cloudflare Pages with D1 (SQLite) database.

---

## Quick Start

```typescript
import { Session } from 'curl-cffi-node';

// Create a session impersonating Chrome 116
const session = new Session({ impersonate: 'chrome116' });

// Make a request — your TLS fingerprint matches a real Chrome browser
const response = await session.get('https://example.com');

console.log(response.status);     // 200
console.log(response.json());     // { ... }
console.log(response.elapsed);    // 142.5 (ms)
```

---

## Installation

```bash
npm install curl-cffi-node
```

Prebuilt native binaries are available for all [supported platforms](#supported-platforms). No compilation needed.

### From Source

If you need to build from source (custom platform or modifications):

```bash
git clone --recursive https://github.com/meodemsao/curl-cffi-node.git
cd curl-cffi-node
npm install
npm run build
```

> Requires Rust toolchain (1.70+) and system dependencies for curl-impersonate. See [Building from Source](#building-from-source) for details.

---

## Usage

### Simple Requests

Use shorthand functions for one-off requests:

```typescript
import { get, post, del } from 'curl-cffi-node';

// GET
const r1 = await get('https://httpbin.org/get', { impersonate: 'chrome116' });
console.log(r1.json());

// POST with JSON
const r2 = await post('https://httpbin.org/post', {
  data: { name: 'curl-cffi-node', version: '0.1.0' },
  impersonate: 'chrome110',
});
console.log(r2.json());

// DELETE
const r3 = await del('https://httpbin.org/delete');
console.log(r3.status); // 200
```

### Session with Browser Impersonation

Sessions persist cookies and reuse connections across requests:

```typescript
import { Session } from 'curl-cffi-node';

const session = new Session({
  impersonate: 'chrome116',     // TLS fingerprint target
  headers: { 'X-Custom': 'value' },  // Default headers
  timeout: 30,                  // Default timeout (seconds)
  followRedirects: true,        // Follow 3xx redirects
  maxRedirects: 10,             // Max redirect chain length
  verify: true,                 // Verify SSL certificates
});

// All requests share cookies and connection
const r1 = await session.get('https://example.com/login');
const r2 = await session.post('https://example.com/api/data', {
  data: { key: 'value' },
});
// r2 automatically sends cookies from r1
```

### POST with JSON Body

Pass an object as `data` — it's automatically serialized with `Content-Type: application/json`:

```typescript
const session = new Session({ impersonate: 'chrome116' });

// Object → auto JSON serialization
const r = await session.post('https://httpbin.org/post', {
  data: { username: 'admin', password: 'secret' },
});

// String body
const r2 = await session.post('https://httpbin.org/post', {
  data: 'raw string body',
  headers: { 'Content-Type': 'text/plain' },
});

// Buffer body
const r3 = await session.post('https://httpbin.org/post', {
  data: Buffer.from('binary data'),
});
```

### Custom Headers & Query Parameters

```typescript
const session = new Session({
  headers: { 'Authorization': 'Bearer token123' },  // Session-level
});

const r = await session.get('https://httpbin.org/get', {
  headers: { 'X-Request-ID': 'abc-123' },  // Request-level (merged)
  params: { page: 1, limit: 50, search: 'nodejs' },  // → ?page=1&limit=50&search=nodejs
});

console.log(r.json().args);
// { page: '1', limit: '50', search: 'nodejs' }
```

### Cookie Management

```typescript
const session = new Session({ impersonate: 'chrome110' });

// Cookies are automatically stored from Set-Cookie headers
await session.get('https://httpbin.org/cookies/set?session_id=abc123');

// Read current cookies
console.log(session.cookies);
// ['httpbin.org\tFALSE\t/\tFALSE\t0\tsession_id\tabc123']

// Export cookies (Netscape format) for persistence
const exported = session.exportCookies();
// Save to file, database, etc.

// Import cookies into a new session
const session2 = new Session({ cookies: exported });

// Or import later
session2.importCookies([
  'example.com\tFALSE\t/\tTRUE\t0\ttoken\txyz789'
]);

// Clear all cookies
session.clearCookies();

// Clear cookies for specific domain
session.clearCookies('httpbin.org');
```

### Proxy Support

```typescript
const session = new Session({
  impersonate: 'chrome116',
  proxy: 'http://user:pass@proxy.example.com:8080',
});

// All requests through proxy
const r = await session.get('https://httpbin.org/ip');
console.log(r.json().origin); // Proxy IP

// Per-request proxy override
const r2 = await session.get('https://httpbin.org/ip', {
  proxy: 'socks5://localhost:1080',
});

// SOCKS5 with authentication
const r3 = await session.get('https://httpbin.org/ip', {
  proxy: 'socks5://user:pass@socks-proxy.example.com:1080',
});
```

### WebSocket with Impersonated TLS

```typescript
import { CurlWebSocket } from 'curl-cffi-node';

const ws = new CurlWebSocket('wss://echo.websocket.org', {
  impersonate: 'chrome116',
  headers: { 'Origin': 'https://example.com' },
});

ws.on('open', () => {
  console.log('Connected with Chrome TLS fingerprint!');
  ws.send('Hello from curl-cffi-node!');
});

ws.on('message', (data) => {
  console.log('Received:', data);
  ws.close();
});

ws.on('close', () => console.log('Disconnected'));
ws.on('error', (err) => console.error('Error:', err));

await ws.connect();
```

### Custom TLS Fingerprint

For advanced users who need specific cipher suites or TLS settings:

```typescript
import { Curl, CurlOpt } from 'curl-cffi-node';

const curl = new Curl();
curl.setoptStr(CurlOpt.Url, 'https://tls.peet.ws/api/all');

// Custom cipher suite
curl.setoptStr(CurlOpt.SslCipherList,
  'TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256'
);

// Custom elliptic curves
curl.setoptStr(CurlOpt.SslEcCurves,
  'X25519:P-256:P-384'
);

// Custom HTTP/2 settings
curl.setoptStr(CurlOpt.Http2PseudoHeadersOrder, 'm,p,a,s');
curl.setoptStr(CurlOpt.Http2Settings,
  '1:65536;3:1000;4:6291456;6:262144'
);

const result = await curl.performAsync();
const tls = JSON.parse(result.body.toString());
console.log('JA3:', tls.tls.ja3_hash);
```

### Streaming Response

For large downloads or server-sent events:

```typescript
const session = new Session({ impersonate: 'chrome116' });
const response = await session.get('https://httpbin.org/bytes/1048576');

// Get a Node.js Readable stream
const stream = response.stream();

let totalBytes = 0;
stream.on('data', (chunk) => {
  totalBytes += chunk.length;
});
stream.on('end', () => {
  console.log(`Downloaded ${totalBytes} bytes`);
});

// Or pipe to a file
import { createWriteStream } from 'fs';
response.stream().pipe(createWriteStream('download.bin'));
```

### Async Concurrent Requests

`performAsync()` runs in a thread pool — the Node.js event loop stays free:

```typescript
import { Curl, CurlOpt } from 'curl-cffi-node';

const urls = [
  'https://httpbin.org/get?id=1',
  'https://httpbin.org/get?id=2',
  'https://httpbin.org/get?id=3',
  'https://httpbin.org/get?id=4',
  'https://httpbin.org/get?id=5',
];

// All 5 requests execute in parallel
const results = await Promise.all(
  urls.map((url) => {
    const curl = new Curl();
    curl.setoptStr(CurlOpt.Url, url);
    curl.setoptLong(CurlOpt.TimeoutMs, 10000);
    return curl.performAsync();
  })
);

results.forEach((r, i) => {
  console.log(`Request ${i + 1}: ${r.statusCode}`);
});
```

### Low-Level Curl Handle

Full control over curl options for advanced use cases:

```typescript
import { Curl, CurlOpt, CurlInfo, BrowserType } from 'curl-cffi-node';

const curl = new Curl();

// Impersonate Chrome 116
curl.impersonate(BrowserType.Chrome116);

// Or use string target
curl.impersonateStr('safari15_5');

// Set options
curl.setoptStr(CurlOpt.Url, 'https://httpbin.org/get');
curl.setoptLong(CurlOpt.FollowLocation, 1);
curl.setoptLong(CurlOpt.MaxRedirs, 10);
curl.setoptLong(CurlOpt.TimeoutMs, 30000);
curl.setoptList(CurlOpt.HttpHeader, [
  'Accept: application/json',
  'Accept-Language: en-US,en;q=0.9',
]);

// Synchronous perform (blocks event loop)
const result = curl.perform();

// Or async perform (non-blocking)
const result2 = await curl.performAsync();

console.log('Status:', result.statusCode);
console.log('Body:', result.body.toString());
console.log('Headers:', result.headers);

// Get info after perform
console.log('Total time:', curl.getinfo(CurlInfo.TotalTime));
console.log('Effective URL:', curl.getinfo(CurlInfo.EffectiveUrl));

// Reuse handle
curl.reset();
curl.setoptStr(CurlOpt.Url, 'https://another-site.com');
const result3 = await curl.performAsync();
```

---

## API Reference

### Session

```typescript
new Session(options?: SessionOptions)
```

| Option | Type | Default | Description |
|---|---|---|---|
| `impersonate` | `string` | — | Browser target (e.g., `'chrome116'`, `'safari15_5'`) |
| `headers` | `Record<string, string>` | — | Default headers for all requests |
| `timeout` | `number` | `0` (no timeout) | Default timeout in seconds |
| `followRedirects` | `boolean` | `true` | Follow 3xx redirects |
| `maxRedirects` | `number` | `30` | Maximum redirect chain length |
| `proxy` | `string` | — | Proxy URL (`http://`, `socks5://`) |
| `verify` | `boolean` | `true` | Verify SSL certificates |
| `defaultHeaders` | `boolean` | `true` | Apply browser default headers |
| `cookies` | `string[]` | — | Pre-existing cookies (Netscape format) |

#### Methods

| Method | Return | Description |
|---|---|---|
| `get(url, options?)` | `Promise<Response>` | HTTP GET |
| `post(url, options?)` | `Promise<Response>` | HTTP POST |
| `put(url, options?)` | `Promise<Response>` | HTTP PUT |
| `delete(url, options?)` | `Promise<Response>` | HTTP DELETE |
| `head(url, options?)` | `Promise<Response>` | HTTP HEAD |
| `patch(url, options?)` | `Promise<Response>` | HTTP PATCH |
| `options(url, options?)` | `Promise<Response>` | HTTP OPTIONS |
| `cookies` | `string[]` | Get all cookies (Netscape format) |
| `exportCookies()` | `string[]` | Export cookies for persistence |
| `importCookies(cookies)` | `void` | Import Netscape-format cookies |
| `clearCookies(domain?)` | `void` | Clear all or domain-specific cookies |

#### RequestOptions

| Option | Type | Description |
|---|---|---|
| `headers` | `Record<string, string>` | Merged with session headers |
| `data` | `string \| Buffer \| object` | Request body (object → JSON) |
| `params` | `Record<string, string \| number \| boolean>` | URL query parameters |
| `timeout` | `number` | Override session timeout (seconds) |
| `followRedirects` | `boolean` | Override session redirect behavior |
| `proxy` | `string` | Override session proxy |
| `verify` | `boolean` | Override session SSL verification |
| `impersonate` | `string` | Override session impersonation target |

### Response

| Property/Method | Type | Description |
|---|---|---|
| `status` | `number` | HTTP status code |
| `ok` | `boolean` | `true` if status is 200–299 |
| `url` | `string` | Effective URL (after redirects) |
| `headers` | `Headers` | Response headers (case-insensitive) |
| `elapsed` | `number` | Total request time in ms |
| `timing` | `Timing` | Detailed timing breakdown |
| `text()` | `string` | Body as UTF-8 string |
| `json()` | `any` | Body parsed as JSON |
| `buffer()` | `Buffer` | Raw body as Buffer |
| `stream()` | `Readable` | Body as Node.js Readable stream |

#### Timing Object

| Field | Type | Description |
|---|---|---|
| `dns` | `number` | DNS resolution time (ms) |
| `connect` | `number` | TCP connection time (ms) |
| `tls` | `number` | TLS handshake time (ms) |
| `total` | `number` | Total request time (ms) |

### CurlWebSocket

```typescript
new CurlWebSocket(url: string, options?: CurlWebSocketOptions)
```

| Method | Description |
|---|---|
| `connect()` | Initiate WebSocket connection |
| `send(data)` | Send text or binary message |
| `close()` | Close the connection |
| `connected` | `boolean` — current connection state |

| Event | Payload | Description |
|---|---|---|
| `open` | — | Connection established |
| `message` | `string \| Buffer` | Message received |
| `close` | — | Connection closed |
| `error` | `Error` | Error occurred |

### Error Hierarchy

```
Error
 └── CurlError          (code, curlMessage)
      ├── TimeoutError   (code: 28)
      ├── ConnectionError (code: 7)
      ├── TLSError        (code: 35, 51, 58, 59, 60)
      └── ProxyError      (code: 5, 97)
```

```typescript
import { Session, TimeoutError, ConnectionError, TLSError } from 'curl-cffi-node';

try {
  const r = await session.get('https://example.com', { timeout: 5 });
} catch (err) {
  if (err instanceof TimeoutError) {
    console.log('Request timed out after', err.code, 'seconds');
  } else if (err instanceof ConnectionError) {
    console.log('Connection failed:', err.curlMessage);
  } else if (err instanceof TLSError) {
    console.log('TLS error:', err.curlMessage);
  }
}
```

### Shorthand Functions

One-off requests without creating a Session:

```typescript
import { get, post, put, del, head, patch } from 'curl-cffi-node';

const r = await get('https://httpbin.org/get', { impersonate: 'chrome116' });
```

---

## Browser Impersonation Targets

| Target | Browser | JA3 Match | HTTP/2 Match |
|---|---|---|---|
| `chrome99` | Chrome 99 | ✅ | ✅ |
| `chrome100` | Chrome 100 | ✅ | ✅ |
| `chrome101` | Chrome 101 | ✅ | ✅ |
| `chrome104` | Chrome 104 | ✅ | ✅ |
| `chrome107` | Chrome 107 | ✅ | ✅ |
| `chrome110` | Chrome 110 | ✅ | ✅ |
| `chrome116` | Chrome 116 | ✅ | ✅ |
| `chrome119` | Chrome 119 | ✅ | ✅ |
| `chrome120` | Chrome 120 | ✅ | ✅ |
| `chrome123` | Chrome 123 | ✅ | ✅ |
| `chrome124` | Chrome 124 | ✅ | ✅ |
| `chrome131` | Chrome 131 | ✅ | ✅ |
| `edge99` | Edge 99 | ✅ | ✅ |
| `edge101` | Edge 101 | ✅ | ✅ |
| `safari15_3` | Safari 15.3 | ✅ | ✅ |
| `safari15_5` | Safari 15.5 | ✅ | ✅ |
| `safari17_0` | Safari 17.0 | ✅ | ✅ |
| `safari17_2_ios` | Safari 17.2 (iOS) | ✅ | ✅ |
| `safari18_0` | Safari 18.0 | ✅ | ✅ |

> Full list depends on the bundled curl-impersonate version. Use `curl.impersonateStr('target')` with any supported target string.

---

## Supported Platforms

| Platform | Architecture | Binary |
|---|---|---|
| Linux | x64 (glibc) | `@curl-cffi-node/linux-x64-gnu` |
| Linux | x64 (musl) | `@curl-cffi-node/linux-x64-musl` |
| Linux | ARM64 (glibc) | `@curl-cffi-node/linux-arm64-gnu` |
| macOS | x64 (Intel) | `@curl-cffi-node/darwin-x64` |
| macOS | ARM64 (M1/M2/M3) | `@curl-cffi-node/darwin-arm64` |
| Windows | x64 (GNU) | `@curl-cffi-node/win32-x64-gnu` |

Binaries are automatically selected at install time via `optionalDependencies`.

---

## Performance

`curl-cffi-node` uses native code (Rust + C) for maximum throughput:

| Metric | `curl-cffi-node` | `node-fetch` | `axios` |
|---|---|---|---|
| **TLS fingerprint** | Browser-identical | Node.js default | Node.js default |
| **Anti-bot bypass** | ✅ | ❌ | ❌ |
| **Connection reuse** | ✅ Built-in | Manual | Manual |
| **Async I/O** | Thread pool | libuv | libuv |
| **Cookie persistence** | ✅ Built-in | Manual | Manual |
| **WebSocket + impersonation** | ✅ | ❌ | ❌ |
| **Binary size** | ~5MB native | 0 (JS only) | 0 (JS only) |

---

## Building from Source

### Prerequisites

- **Node.js** ≥ 18
- **Rust** ≥ 1.70 ([rustup.rs](https://rustup.rs/))
- **System dependencies** for curl-impersonate:
  - Linux: `build-essential`, `pkg-config`, `libssl-dev`
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools

### Build Steps

```bash
# Clone with submodules (includes curl-impersonate)
git clone --recursive https://github.com/meodemsao/curl-cffi-node.git
cd curl-cffi-node

# Install Node.js dependencies
npm install

# Build native module (Rust) + TypeScript
npm run build

# Verify
node -e "const m = require('.'); console.log(m.curlVersion())"
```

---

## Testing

```bash
# Unit tests only (no network, <200ms)
npm run test:unit

# Integration tests (requires network)
npm run test:integration

# All tests
npm run test:fast

# Rust native tests
npm run test:rust

# Watch mode
npm run test:watch
```

| Suite | Tests | Time | Network |
|---|---|---|---|
| Unit | 54 | ~180ms | ❌ |
| Integration | 112 | ~30s | ✅ |
| **Total** | **166** | **~30s** | — |

---

## Comparison

| Feature | `curl-cffi-node` | `curl-cffi` (Python) | `got` | `undici` |
|---|---|---|---|---|
| Language | Node.js | Python | Node.js | Node.js |
| TLS Impersonation | ✅ | ✅ | ❌ | ❌ |
| HTTP/2 Fingerprint | ✅ | ✅ | ❌ | ❌ |
| WebSocket + TLS | ✅ | ✅ | ❌ | ❌ |
| Cookie Jar | ✅ | ✅ | ✅ | ❌ |
| Proxy Support | ✅ | ✅ | ✅ | ✅ |
| Streaming | ✅ | ✅ | ✅ | ✅ |
| TypeScript | ✅ Native | ❌ | ✅ | ✅ |
| Async | ✅ Thread pool | ✅ asyncio | ✅ | ✅ |

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Run tests (`npm run test:fast`)
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `test:`, etc.)
5. Open a Pull Request

---

## License

[MIT](LICENSE) — see [LICENSE](LICENSE) file for details.

---

## Acknowledgements

- [curl-impersonate](https://github.com/lwthiker/curl-impersonate) — Modified curl with browser TLS fingerprints
- [napi-rs](https://napi.rs) — Rust ↔ Node.js binding framework
- [curl-cffi](https://github.com/yifeikong/curl_cffi) — Python equivalent (inspiration)

---

<p align="center">
  <sub>Built with 🦀 Rust + 💚 Node.js — bypass anti-bot detection with real browser fingerprints</sub>
</p>
