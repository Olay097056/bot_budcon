/**
 * bot_budcon — watch manager tests (ticket 15).
 *
 * Hermetic: mocked fetcher, intervalMs 15ms so the suite is fast.
 * No live TTM fetch, no Playwright.
 */
import { describe, it, expect, vi } from 'vitest';
import { WatchManager } from '../src/watch-manager.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('WatchManager single-flight', () => {
  it('starts and reports active with correct url', async () => {
    const log = vi.fn();
    const wm = new WatchManager(log);
    const fetcher = vi.fn(async () => ({ status: 200, body: '<area href="#fixed.php#A1">' }));
    const r = wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15 });
    expect(r.ok).toBe(true);
    expect(wm.isActive()).toBe(true);
    const s = wm.getStatus();
    expect(s.active).toBe(true);
    expect(s.url).toContain('query=504');
    await sleep(40);
    await wm.stop();
    expect(wm.isActive()).toBe(false);
  });

  it('returns already_active when already watching', async () => {
    const wm = new WatchManager(() => {});
    const fetcher = vi.fn(async () => ({ status: 200, body: '' }));
    wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15 });
    const r2 = wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15 });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('already_active');
    await wm.stop();
  });

  it('captures baseline on first poll and does not fire event', async () => {
    const wm = new WatchManager(() => {});
    const fetcher = vi.fn(async () => ({ status: 200, body: '<area href="#fixed.php#A1"><area href="#fixed.php#A2">' }));
    wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15 });
    await sleep(35);
    const s = wm.getStatus();
    expect(s.baseline).toEqual(expect.arrayContaining(['A1', 'A2']));
    expect(s.lastEvent).toBeNull();
    expect(s.pollCount).toBeGreaterThanOrEqual(1);
    await wm.stop();
  });

  it('detects new zone after baseline', async () => {
    const wm = new WatchManager(() => {});
    let polls = 0;
    const fetcher = vi.fn(async () => {
      polls++;
      if (polls === 1) return { status: 200, body: '<area href="#fixed.php#A1">' };
      return { status: 200, body: '<area href="#fixed.php#A1"><area href="#fixed.php#B7">' };
    });
    wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15 });
    await sleep(70);
    const s = wm.getStatus();
    expect(s.lastEvent).not.toBeNull();
    expect(s.lastEvent?.code).toBe('B7');
    expect(s.baseline).toEqual(expect.arrayContaining(['A1', 'B7']));
    await wm.stop();
  });

  it('stop is idempotent and allows restart', async () => {
    const wm = new WatchManager(() => {});
    const fetcher = vi.fn(async () => ({ status: 200, body: '' }));
    wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15 });
    await sleep(20);
    await wm.stop();
    expect(wm.isActive()).toBe(false);
    await wm.stop(); // second stop still ok
    const r2 = wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15 });
    expect(r2.ok).toBe(true);
    await wm.stop();
  });

  it('returns no_url when url missing', () => {
    const wm = new WatchManager(() => {});
    const r = wm.start({} as never);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_url');
  });

  it('keeps polling through http errors', async () => {
    const wm = new WatchManager(() => {});
    let polls = 0;
    const fetcher = vi.fn(async () => {
      polls++;
      if (polls === 1) return { status: 500, body: '' };
      return { status: 200, body: '<area href="#fixed.php#A1">' };
    });
    wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15 });
    await sleep(60);
    const s = wm.getStatus();
    // After one 500, second poll sets baseline to A1
    expect(s.baseline).toEqual(expect.arrayContaining(['A1']));
    await wm.stop();
  });

  it('auto-book fires onNewZone when enabled and new zone appears', async () => {
    const onNewZone = vi.fn(async () => {});
    const wm = new WatchManager(() => {});
    let polls = 0;
    const fetcher = vi.fn(async () => {
      polls++;
      if (polls === 1) return { status: 200, body: '<area href="#fixed.php#A1">' };
      return { status: 200, body: '<area href="#fixed.php#A1"><area href="#fixed.php#Z9">' };
    });
    wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15, autoBook: true, quantity: 2, onNewZone });
    await sleep(80);
    expect(onNewZone).toHaveBeenCalledWith('Z9', expect.stringContaining('Z9'));
    expect(wm.getStatus().lastEvent?.code).toBe('Z9');
    await wm.stop();
  });

  it('auto-book does not fire when disabled', async () => {
    const onNewZone = vi.fn(async () => {});
    const wm = new WatchManager(() => {});
    let polls = 0;
    const fetcher = vi.fn(async () => {
      polls++;
      if (polls === 1) return { status: 200, body: '<area href="#fixed.php#A1">' };
      return { status: 200, body: '<area href="#fixed.php#A1"><area href="#fixed.php#Z9">' };
    });
    wm.start({ url: 'https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504', fetcher, intervalMs: 15, autoBook: false, onNewZone });
    await sleep(70);
    expect(onNewZone).not.toHaveBeenCalled();
    await wm.stop();
  });
});
