import { describe, it, expect } from 'vitest';
import { _internal } from '../src/discover.js';
import { parseZones } from '../src/zones.js';

const { extractConcertListing, parseRounds, parseK } = _internal;

describe('discover.extractConcertListing', () => {
  it('extracts unique queries with nearest slug/title (alt)', () => {
    const html = `
      <div class="card"><a href="/concert/idol1st-kenty.html"><img alt="''IDOL1ST KENTY'' ASIA TOUR 2026" /></a>
      <a href="https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504">ซื้อบัตร</a></div>
      <div class="card"><a href="/concert/joji-solaris.html"><img alt="JOJI : SOLARIS" /></a>
      <a href="https://booking.thaiticketmajor.com/booking/3m/zones.php?query=927">ซื้อบัตร</a></div>
      <!-- dup query ignored -->
      <a href="https://booking.thaiticketmajor.com/booking/3m/zones.php?query=504">dup</a>
    `;
    const out = extractConcertListing(html);
    expect(out.map((o) => o.query)).toEqual(['504', '927']);
    expect(out[0]!.slug).toBe('idol1st-kenty.html');
    expect(out[0]!.title).toContain('IDOL1ST');
    expect(out[1]!.title).toBe('JOJI : SOLARIS');
  });
});

describe('discover.parseRounds / parseK', () => {
  it('parses round options from #rdId', () => {
    const html = `<select id="rdId"><option value="">เลือกรอบ</option><option value="81634">05 Sep</option><option value="81635">06 Sep</option></select>`;
    expect(parseRounds(html)).toEqual(['81634', '81635']);
  });
  it('parses hidden k', () => {
    expect(parseK('<input name="k" value="abc123">')).toBe('abc123');
    expect(parseK('<div>no k</div>')).toBe(null);
  });
});

describe('discover integration: zones on real-ish fixtures', () => {
  it('parses image-map zones (TTM real shape)', () => {
    const html = `<map name="uMap2Map"><area href="#fixed.php#A1" /><area href="#fixed.php#B2" /></map>
                  <select id="rdId"><option value="81634"></option></select>
                  <input name="k" value="k300122">`;
    const zones = parseZones(html).map((z) => z.code);
    expect(zones).toEqual(['A1', 'B2']);
    expect(parseRounds(html)).toEqual(['81634']);
    expect(parseK(html)).toBe('k300122');
  });
});
