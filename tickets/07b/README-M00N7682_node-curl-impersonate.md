# node-curl-impersonate

Node.js HTTP client with **browser TLS fingerprint impersonation**, powered by [libcurl-impersonate](https://github.com/lexiforest/curl-impersonate).

The Node.js equivalent of Python's [curl_cffi](https://github.com/lexiforest/curl_cffi).

## Features

- **50+ browser presets** — Chrome, Firefox, Safari, Edge, Tor
- **TLS fingerprint impersonation** — JA3, Akamai, HTTP/2 SETTINGS
- **Fetch API compatible** — `fetch()` with `impersonate` option
- **Session** — connection pooling + automatic cookie persistence
- **HTTP/2 & HTTP/3** — automatic with impersonation
- **WebSocket** — with TLS fingerprint applied
- **Custom JA3/Akamai** — manual fingerprint strings
- **Proxy support** — HTTP, HTTPS, SOCKS4, SOCKS5
- **TypeScript** — full type definitions included
- **N-API native addon** — direct C binding, no child_process overhead

## Install

```bash
npm install node-curl-impersonate
```

> Requires Node.js >= 18. Prebuilt binaries for macOS (arm64, x86_64) and Linux (x86_64, arm64).
> Falls back to source compilation if no prebuild available.

## Quick Start

```ts
import { fetch } from "node-curl-impersonate";

// Impersonate Chrome 146
const response = await fetch("https://example.com", {
  impersonate: "chrome146",
});

console.log(response.status);       // 200
console.log(await response.json()); // parsed JSON
```

## Usage

### Basic Fetch

```ts
import { fetch } from "node-curl-impersonate";

// GET
const r = await fetch("https://httpbin.org/get", {
  impersonate: "chrome146",
});

// POST
const r2 = await fetch("https://httpbin.org/post", {
  method: "POST",
  impersonate: "firefox147",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: "value" }),
});
```

### Session (Cookie Persistence + Connection Pooling)

```ts
import { Session } from "node-curl-impersonate";

const session = new Session({ impersonate: "chrome146" });

// Login — cookies automatically saved
await session.fetch("https://example.com/login", {
  method: "POST",
  body: JSON.stringify({ user: "test", pass: "test" }),
});

// Subsequent requests include cookies
const dashboard = await session.fetch("https://example.com/dashboard");

// Manual cookie access
console.log(session.cookies.toJSON());

session.close();
```

### Browser Presets

```ts
// Chrome
await fetch(url, { impersonate: "chrome146" });  // latest
await fetch(url, { impersonate: "chrome120" });
await fetch(url, { impersonate: "chrome99" });

// Firefox
await fetch(url, { impersonate: "firefox147" }); // latest
await fetch(url, { impersonate: "firefox133" });

// Safari
await fetch(url, { impersonate: "safari2601" }); // latest macOS
await fetch(url, { impersonate: "safari260_ios" }); // iOS

// Edge
await fetch(url, { impersonate: "edge101" });

// Aliases (resolve to latest)
await fetch(url, { impersonate: "chrome" });
await fetch(url, { impersonate: "firefox" });
await fetch(url, { impersonate: "safari" });
```

<details>
<summary>All 50+ presets</summary>

**Chrome**: `chrome99`, `chrome100`, `chrome101`, `chrome104`, `chrome107`, `chrome110`, `chrome116`, `chrome119`, `chrome120`, `chrome123`, `chrome124`, `chrome131`, `chrome133a`, `chrome136`, `chrome142`, `chrome145`, `chrome146`

**Chrome Android**: `chrome99_android`, `chrome131_android`

**Firefox**: `firefox133`, `firefox135`, `firefox144`, `firefox147`

**Safari macOS**: `safari153`, `safari155`, `safari170`, `safari180`, `safari184`, `safari260`, `safari2601`

**Safari iOS**: `safari172_ios`, `safari180_ios`, `safari184_ios`, `safari260_ios`

**Edge**: `edge99`, `edge101`

**Tor**: `tor145`

</details>

### Custom JA3 / Akamai Fingerprint

```ts
// Custom JA3 string
await fetch(url, {
  ja3: "771,4865-4866-4867-49195-49199,...",
});

// Custom Akamai fingerprint
await fetch(url, {
  akamai: "4:16777216|16711681|0|m,p,a,s",
});

// Fine-grained TLS/HTTP2 control
await fetch(url, {
  impersonate: "chrome146",
  extraFingerprints: {
    tlsMinVersion: "1.2",
    tlsGrease: true,
    tlsPermuteExtensions: false,
    tlsCertCompression: "brotli",
    http2StreamWeight: 256,
    http2StreamExclusive: 1,
  },
});
```

### Proxy

```ts
// HTTP proxy
await fetch(url, {
  impersonate: "chrome146",
  proxy: "http://user:pass@proxy.example.com:8080",
});

// SOCKS5 proxy
await fetch(url, {
  proxy: "socks5://proxy.example.com:1080",
});

// Session-level proxy
const session = new Session({
  impersonate: "chrome146",
  proxy: "http://proxy.example.com:8080",
});
```

### Timeout & SSL

```ts
// Timeout in ms
await fetch(url, { timeout: 10000 });

// [connect, total] timeout
await fetch(url, { timeout: [5000, 30000] });

// Disable SSL verification
await fetch(url, { verify: false });
```

### HTTP Version

```ts
await fetch(url, { httpVersion: "2" });   // HTTP/2
await fetch(url, { httpVersion: "3" });   // HTTP/3 (QUIC)
await fetch(url, { httpVersion: "1.1" }); // HTTP/1.1
```

### WebSocket

```ts
import { ImpersonateWebSocket } from "node-curl-impersonate";

const ws = await ImpersonateWebSocket.connect("wss://echo.websocket.org", {
  impersonate: "chrome146",
});

ws.on("message", (data) => console.log("Received:", data));
ws.on("close", (code) => console.log("Closed:", code));

ws.send("hello");
ws.send(Buffer.from([0x01, 0x02])); // binary

ws.close();
```

### Response Object

```ts
const r = await fetch(url, { impersonate: "chrome146" });

// Standard Fetch Response methods
r.status;              // 200
r.ok;                  // true
r.headers.get("content-type");
await r.text();
await r.json();
await r.arrayBuffer();
await r.blob();

// Extended properties
r.httpVersion;         // 2
r.elapsed;             // ms
r.redirectCount;       // 0
r.primaryIp;           // "93.184.216.34"
r.downloadSize;        // bytes
```

## Architecture

```
fetch() / Session.fetch()
         │
    TypeScript API (Session, Headers, CookieJar, Response)
         │
    N-API C++ Addon (node-addon-api)
         │  libuv ↔ curl_multi event loop integration
         │
    libcurl-impersonate (static linked)
         │  BoringSSL + nghttp2 + ngtcp2
         │
    OS Network Stack
```

## Verified Fingerprints

Tested against [tls.peet.ws](https://tls.peet.ws):

| Browser | JA3 Hash | HTTP |
|---------|----------|------|
| chrome146 | `d7079127895458fd9e502a02fc29f54d` | h2 |
| firefox147 | `6f7889b9fb1a62a9577e685c1fcfa919` | h2 |
| safari2601 | `ecdf4f49dd59effc439639da29186671` | h2 |
| edge101 | `cd08e31494f9531f560d64c695473da9` | h2 |
| chrome99 | `0d69ff451640d67ee8b5122752834766` | h2 |
| chrome120 | `08392333598a5e633bb0e9e9564c0eda` | h2 |
| safari180 | `773906b0efdefa24a7f2b8eb6985bf37` | h2 |

Each browser preset produces a unique, real-browser-matching TLS fingerprint.

## Comparison with curl_cffi (Python)

| | node-curl-impersonate | curl_cffi |
|---|---|---|
| Language | Node.js / TypeScript | Python |
| Engine | libcurl-impersonate (same) | libcurl-impersonate (same) |
| Binding | N-API (node-addon-api) | CFFI |
| API Style | Web Fetch API | requests-like |
| Async | Native (libuv + curl_multi) | asyncio |
| TLS Fingerprints | Identical | Identical |
| Browser Presets | 50+ (same) | 50+ (same) |

## Requirements

- Node.js >= 18
- macOS (arm64, x86_64) or Linux (x86_64, arm64, musl)
- `libcurl-impersonate` is statically linked — no system dependency needed

## License

MIT
