/**
 * bot_budcon — book integration test (ticket B follow-up).
 *
 * Verifies that the gate, parser, watch loop, and book-flow step
 * function actually compose: a real `gate()` verdict feeds a real
 * `parseZones()` result, which feeds a real `watch()` loop, which
 * would surface the code to `selectZone()`. The Playwright bits
 * are stubbed at the seam where the gate returns.
 */
import { describe, it, expect, vi } from 'vitest';
import { gate } from '../src/auth-cookies.js';
import type { StoredCookie } from '../src/cookies.js';
import { parseZones } from '../src/zones.js';
import { watch, type WatchEvent } from '../src/watch.js';
import { selectZone } from '../src/book.js';

const farFuture = 4_102_444_800;

const freshCookies: StoredCookie[] = [
  {
    name: 'ttkname',
    value: 'u',
    domain: '.thaiticketmajor.com',
    path: '/',
    secure: false,
    httpOnly: false,
    expires: farFuture,
  },
  {
    name: 'ak_bmsc',
    value: 'p',
    domain: '.thaiticketmajor.com',
    path: '/',
    secure: false,
    httpOnly: false,
    expires: -1,
  },
];

function pageHtml(codes: string[]): string {
  return codes.map((c) => `<a href="#fixed.php#${c}"></a>`).join('\n');
}

describe('integration: gate -> parseZones -> watch -> book step 1', () => {
  it('accepts fresh cookies, parses, fires on the new code, finds the anchor', async () => {
    // 1. Gate
    const verdict = gate(freshCookies);
    expect(verdict.accept).toBe(true);
    expect(verdict.primary?.name).toBe('ttkname');

    // 2. Parser
    const baselineZones = parseZones(pageHtml(['A1']));
    expect(baselineZones.map((z) => z.code)).toEqual(['A1']);

    // 3. Watch loop (mock fetcher — first poll = baseline, second
    //    poll adds B7 which fires).
    let poll = 0;
    const events: WatchEvent[] = [];
    const fetcher = async () => {
      poll++;
      return {
        status: 200,
        body: poll === 1 ? pageHtml(['A1']) : pageHtml(['A1', 'B7']),
      };
    };
    for await (const ev of watch({
      url: 'https://booking.thaiticketmajor.com/zones?query=smoke',
      fetcher,
      intervalMs: 10,
      maxIterations: 3,
    })) {
      events.push(ev);
    }
    expect(events.map((e) => e.zone.code)).toEqual(['B7']);

    // 4. Book step 1 — selectZone finds the matching anchor.
    const code = events[0]!.zone.code;
    const link = { click: vi.fn(async () => undefined) };
    const page = {
      $: vi.fn(async (sel: string) => (sel.includes(code) ? link : null)),
      waitForLoadState: vi.fn(async () => undefined),
    };
    const r = await selectZone(page as never, code);
    expect(r.ok).toBe(true);
    expect(link.click).toHaveBeenCalledOnce();
  });

  it('blocks the pipeline at the gate when auth cookies are expired', async () => {
    const expired: StoredCookie[] = [
      {
        name: 'ttkname',
        value: 'u',
        domain: '.thaiticketmajor.com',
        path: '/',
        secure: false,
        httpOnly: false,
        expires: 1_577_836_800, // 2020-01-01
      },
      {
        name: 'ak_bmsc',
        value: 'p',
        domain: '.thaiticketmajor.com',
        path: '/',
        secure: false,
        httpOnly: false,
        expires: -1,
      },
    ];
    const verdict = gate(expired);
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toBe('expired');

    // parseZones still runs (downstream of the gate).
    const zones = parseZones(pageHtml(['A1', 'B7']));
    expect(zones.length).toBe(2);
  });

  it('blocks the pipeline at the gate when phase1 cookies are missing', async () => {
    const noPhase1: StoredCookie[] = [
      {
        name: 'ttkname',
        value: 'u',
        domain: '.thaiticketmajor.com',
        path: '/',
        secure: false,
        httpOnly: false,
        expires: farFuture,
      },
    ];
    const verdict = gate(noPhase1);
    expect(verdict.accept).toBe(false);
    expect(verdict.reason).toBe('no_phase1');
  });
});