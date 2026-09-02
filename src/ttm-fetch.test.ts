import { describe, it, expect, vi } from 'vitest';
import { ttmFetch, isSoftBlocked, hardenedFetcher } from '../src/ttm-fetch.js';

const ok = (body = '<html>zones</html>', via: 'curl' | 'wreq' | 'fetch' | 'browser' = 'wreq'): { status: number; body: string; finalUrl?: string; via: 'curl' | 'wreq' | 'fetch' | 'browser' } =>
  ({ status: 200, body, via });

describe('isSoftBlocked', () => {
  it('2xx html is good', () => {
    expect(isSoftBlocked({ status: 200, body: '<html>tableseats</html>' })).toBe(false);
  });
  it('403/429/503 blocked', () => {
    expect(isSoftBlocked({ status: 403, body: '' })).toBe(true);
    expect(isSoftBlocked({ status: 429, body: '' })).toBe(true);
    expect(isSoftBlocked({ status: 503, body: '' })).toBe(true);
  });
  it('WAF markers blocked even on 200', () => {
    expect(isSoftBlocked({ status: 200, body: 'waf-verify please wait' })).toBe(true);
    expect(isSoftBlocked({ status: 200, body: 'Access Denied' })).toBe(true);
  });
  it('signin meta-refresh blocked (71-byte bounce)', () => {
    expect(isSoftBlocked({ status: 200, body: '<meta http-equiv="refresh" content="0; url=/user/signin.php">' })).toBe(true);
  });
  it('other non-2xx blocked', () => {
    expect(isSoftBlocked({ status: 500, body: 'x' })).toBe(true);
  });
});

describe('ttmFetch chain', () => {
  it('returns first good transport (curl) without trying others', async () => {
    const curl = vi.fn(async () => ok('via curl', 'curl'));
    const wreq = vi.fn(async () => ok());
    const nodeFetch = vi.fn(async () => ok());
    const browser = vi.fn(async () => ok());
    const r = await ttmFetch('https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', {}, { curl, wreq, nodeFetch, browser });
    expect(r.via).toBe('curl');
    expect(curl).toHaveBeenCalledTimes(1);
    expect(wreq).not.toHaveBeenCalled();
    expect(nodeFetch).not.toHaveBeenCalled();
    expect(browser).not.toHaveBeenCalled();
  });

  it('falls through wreq 403 to node fetch', async () => {
    const wreq = vi.fn(async () => ({ status: 403, body: 'denied', via: 'wreq' as const }));
    const nodeFetch = vi.fn(async () => ok('real zones', 'fetch'));
    const browser = vi.fn(async () => ok());
    const r = await ttmFetch('https://x/', {}, { wreq, nodeFetch, browser });
    expect(r.via).toBe('fetch');
    expect(r.body).toBe('real zones');
    expect(browser).not.toHaveBeenCalled();
  });

  it('falls through signin meta-refresh to browser', async () => {
    const meta = '<meta http-equiv="refresh" content="0; url=/user/signin.php">';
    const wreq = vi.fn(async () => ({ status: 200, body: meta, via: 'wreq' as const }));
    const nodeFetch = vi.fn(async () => ({ status: 200, body: meta, via: 'fetch' as const }));
    const browser = vi.fn(async () => ok('<area href="#fixed.php#A1">', 'browser'));
    const r = await ttmFetch('https://x/', {}, { wreq, nodeFetch, browser });
    expect(r.via).toBe('browser');
    expect(r.body).toContain('fixed.php#A1');
  });

  it('returns last result when everything is blocked', async () => {
    const wreq = vi.fn(async () => ({ status: 403, body: 'a', via: 'wreq' as const }));
    const nodeFetch = vi.fn(async () => ({ status: 403, body: 'b', via: 'fetch' as const }));
    const browser = vi.fn(async () => ({ status: 403, body: 'c', via: 'browser' as const }));
    const r = await ttmFetch('https://x/', {}, { wreq, nodeFetch, browser });
    expect(r.status).toBe(403);
    expect(r.body).toBe('c');
  });

  it('transport throw does not kill the chain', async () => {
    const wreq = vi.fn(async () => { throw new Error('native lib missing'); });
    const nodeFetch = vi.fn(async () => ok('via fetch', 'fetch'));
    const browser = vi.fn(async () => ok());
    const r = await ttmFetch('https://x/', {}, { wreq, nodeFetch, browser });
    expect(r.via).toBe('fetch');
    expect(r.body).toBe('via fetch');
  });

  it('hardenedFetcher passes referer and returns plain shape', async () => {
    let seenReferer: string | undefined;
    const wreq = vi.fn(async (_u: string, o: { referer?: string }) => { seenReferer = o.referer; return ok(); });
    const f = hardenedFetcher({ referer: 'https://www.thaiticketmajor.com/concert/' }, { wreq });
    const r = await f('https://x/');
    expect(r.status).toBe(200);
    expect(seenReferer).toBe('https://www.thaiticketmajor.com/concert/');
  });
});
