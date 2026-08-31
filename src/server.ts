/**
 * bot_budcon — UI dashboard HTTP server.
 *
 * Two endpoints now (ticket 06):
 *   - GET  /             → serves ui/index.html
 *   - GET  /api/status   → { chromeAlive, loggedIn, watchActive,
 *                             sensorReady, lastLog }
 *
 * Login / watch / cmd endpoints land in their own tickets
 * (04, 05, 06 follow-ups). They are stubbed here so the UI can
 * already render a Login button — clicking it 404s until those
 * tickets land.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { BotEngine } from './bot-engine.js';
import { loadCookies } from './cookies.js';
import { gate } from './auth-cookies.js';

// Single shared engine instance for the UI server's lifetime.
const engine = new BotEngine();

const UI_DIR = resolve('ui');

/** Reply with JSON. */
function json(res: ServerResponse, status: number, body: unknown): void {
  const buf = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(buf),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(buf);
}

/** Reply with text/plain. */
function text(res: ServerResponse, status: number, body: string, contentType = 'text/plain; charset=utf-8'): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

interface StatusResponse {
  chromeAlive: boolean;
  loggedIn: boolean;
  watchActive: boolean;
  /** True once ticket 02's wreq-js transport has been smoke-tested. */
  sensorReady: boolean;
  port: number;
  lastLog: string[];
}

const lastLog: string[] = [];

function log(line: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  const formatted = `[${ts}] ${line}`;
  // eslint-disable-next-line no-console
  console.log(formatted);
  lastLog.push(formatted);
  if (lastLog.length > 50) lastLog.shift();
}

function getStatus(): StatusResponse {
  return {
    chromeAlive: engine.hasContext(),
    loggedIn: false, // wired in ticket 04
    watchActive: false, // wired in ticket 05
    sensorReady: true, // wreq-js verified in ticket 02
    port: config.server.port,
    lastLog: [...lastLog],
  };
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${config.server.port}`);

  // Dashboard.
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      const html = readFileSync(join(UI_DIR, 'index.html'));
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': html.length,
      });
      res.end(html);
      return;
    } catch {
      text(res, 404, 'ui/index.html not found');
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/status') {
    json(res, 200, getStatus());
    return;
  }

  // Ticket 10 — auth-cookie gate verdict for the dashboard pill.
  if (req.method === 'GET' && url.pathname === '/api/auth/status') {
    const cookies = loadCookies();
    const verdict = gate(cookies);
    const nowSec = Math.floor(Date.now() / 1000);
    const expiresInSec =
      Number.isFinite(verdict.summary.expiresAtSec) &&
      verdict.summary.expiresAtSec !== Number.POSITIVE_INFINITY
        ? Math.max(0, verdict.summary.expiresAtSec - nowSec)
        : null;
    // Three-state pill: ok (green), expiring (yellow < 5 min),
    // bad (red). The status pill in ui/index.html maps these.
    let pill: 'ok' | 'expiring' | 'bad';
    if (verdict.accept) {
      pill = expiresInSec !== null && expiresInSec < 300 ? 'expiring' : 'ok';
    } else {
      pill = 'bad';
    }
    json(res, 200, {
      accept: verdict.accept,
      reason: verdict.reason ?? null,
      primary: verdict.primary?.name ?? null,
      expiresInSec,
      pill,
      authCount: verdict.summary.all.length,
      phase1Count: verdict.summary.phase1.length,
    });
    return;
  }

  // Stub endpoints — return a clear "not implemented" until the
  // corresponding tickets close.
  if (req.method === 'POST' && url.pathname === '/api/login/start') {
    text(res, 501, 'login flow not implemented — see wayfinder ticket 04');
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/login/status') {
    json(res, 200, { phase: 'idle', loggedIn: false });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/cmd') {
    text(res, 501, 'cmd dispatch not implemented — see wayfinder ticket 05');
    return;
  }

  text(res, 404, `not found: ${req.method ?? 'GET'} ${url.pathname}`);
}

const server = createServer((req, res) => {
  void handle(req, res).catch((e: unknown) => {
    log(`unhandled: ${e instanceof Error ? e.stack ?? e.message : e}`);
    text(res, 500, 'internal error');
  });
});

server.listen(config.server.port, () => {
  log(`bot_budcon UI → http://localhost:${config.server.port}`);
});

const shutdown = (): void => {
  log('shutting down');
  server.close();
  void engine.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
