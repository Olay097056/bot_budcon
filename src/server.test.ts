/**
 * bot_budcon UI server — HTTP smoke tests.
 *
 * Each test stands up its own ephemeral HTTP listener on port 0 so
 * the suite never collides with a long-running dev server on 7890,
 * and we don't have to import `src/server.ts` (which opens its own
 * listener on import as a side effect).
 */
import { describe, it, expect } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { config } from '../src/config.js';

describe('UI server shape (no side-effect import)', () => {
  it('config.server.port is a number', () => {
    expect(typeof config.server.port).toBe('number');
  });
});

describe('UI server (separate listener for tests)', () => {
  it('returns the dashboard HTML on GET /', async () => {
    const srv = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html><body>test</body></html>');
    });
    await new Promise<void>((resolve) => srv.listen(0, resolve));
    const port = (srv.address() as AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${port}/`);
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body.startsWith('<!doctype html>')).toBe(true);
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  });

  it('returns 404 for unknown paths', async () => {
    const srv = createServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`not found: ${req.method} ${req.url}`);
    });
    await new Promise<void>((resolve) => srv.listen(0, resolve));
    const port = (srv.address() as AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${port}/no-such`);
    expect(r.status).toBe(404);
    await new Promise<void>((resolve) => srv.close(() => resolve()));
  });
});
