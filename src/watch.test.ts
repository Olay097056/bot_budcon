/**
 * bot_budcon — watch loop unit tests.
 *
 * Mocks the fetcher and clock so the test is deterministic.
 */
import { describe, it, expect, vi } from 'vitest';
import { watch } from '../src/watch.js';

function fakeFetcher(htmlByUrl: Record<string, string>) {
  return async (url: string) => {
    const body = htmlByUrl[url] ?? '';
    return { status: 200, body };
  };
}

function nowGen(start: number) {
  let t = start;
  return (): number => t++;
}

describe('watch()', () => {
  it('does not fire for zones seen at baseline', async () => {
    const url = 'https://booking.thaiticketmajor.com/zones?query=504';
    const fetcher = fakeFetcher({
      [url]: '<area href="#fixed.php#A1"><area href="#fixed.php#A2">',
    });
    const events: Array<{ code: string }> = [];
    for await (const ev of watch({
      url,
      fetcher,
      nowMs: nowGen(0),
      intervalMs: 0,
      maxIterations: 3,
    })) {
      events.push({ code: ev.zone.code });
    }
    expect(events).toEqual([]);
  });

  it('fires when a NEW zone appears', async () => {
    const url = 'https://booking.thaiticketmajor.com/zones?query=504';
    let poll = 0;
    const fetcher = async (u: string): Promise<{ status: number; body: string }> => {
      if (u !== url) return { status: 200, body: '' };
      poll++;
      // First call = baseline (A1, A2). Second = A1, A2, B3. Third = same.
      if (poll === 1) return { status: 200, body: '<area href="#fixed.php#A1"><area href="#fixed.php#A2">' };
      if (poll === 2) return { status: 200, body: '<area href="#fixed.php#A1"><area href="#fixed.php#A2"><area href="#fixed.php#B3">' };
      return { status: 200, body: '<area href="#fixed.php#A1"><area href="#fixed.php#A2"><area href="#fixed.php#B3">' };
    };
    const events: Array<{ code: string; observedAtMs: number }> = [];
    for await (const ev of watch({
      url,
      fetcher,
      nowMs: nowGen(0),
      intervalMs: 0,
      maxIterations: 5,
    })) {
      events.push({ code: ev.zone.code, observedAtMs: ev.observedAtMs });
    }
    expect(events).toHaveLength(1);
    expect(events[0]!.code).toBe('B3');
  });

  it('does not fire on transport errors (status >= 300)', async () => {
    const url = 'https://booking.thaiticketmajor.com/zones?query=504';
    let poll = 0;
    const fetcher = async (u: string) => {
      if (u !== url) return { status: 200, body: '' };
      poll++;
      if (poll === 1) return { status: 500, body: '' };
      return { status: 200, body: '<area href="#fixed.php#A1">' };
    };
    const events: Array<{ code: string }> = [];
    for await (const ev of watch({ url, fetcher, nowMs: nowGen(0), intervalMs: 0, maxIterations: 3 })) {
      events.push({ code: ev.zone.code });
    }
    // First poll returned 500, so baseline was never set.
    // Second poll set baseline to {A1}, no new code — no fire.
    expect(events).toEqual([]);
  });

  it('stops after maxIterations', async () => {
    const url = 'https://booking.thaiticketmajor.com/zones?query=504';
    let poll = 0;
    const fetcher = async () => {
      poll++;
      return { status: 200, body: `<area href="#fixed.php#A${poll}">` };
    };
    const events: Array<{ code: string }> = [];
    for await (const ev of watch({
      url,
      fetcher,
      nowMs: nowGen(0),
      intervalMs: 0,
      maxIterations: 5,
    })) {
      events.push({ code: ev.zone.code });
    }
    // Polls observed:
    //   1 → baseline (sets A1), no fire
    //   2 → A1 known + new A2 → fire A2
    //   3 → A1, A2 known + new A3 → fire A3
    //   4 → A1..A3 known + new A4 → fire A4
    //   5 → A1..A4 known + new A5 → fire A5
    // Total fires: 4 (A2..A5). The loop runs 5 polls (one per
    // iteration), but iteration 1 is calibration and yields nothing.
    expect(events.map((e) => e.code)).toEqual(['A2', 'A3', 'A4', 'A5']);
  });
});
