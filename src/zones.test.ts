/**
 * bot_budcon — zone-parser unit tests.
 *
 * Pure functions — no Playwright, no network.
 */
import { describe, it, expect } from 'vitest';
import { parseZones } from '../src/zones.js';

describe('parseZones()', () => {
  it('returns [] for empty input', () => {
    expect(parseZones('')).toEqual([]);
  });

  it('extracts area anchors (image-map style)', () => {
    const html = `
      <area href="#fixed.php#A1" shape="rect" coords="0,0,100,100" />
      <area href="#fixed.php#A2" shape="rect" coords="100,0,200,100" />
    `;
    expect(parseZones(html).map((z) => z.code)).toEqual(['A1', 'A2']);
  });

  it('extracts <a href="#fixed.php#X"> style', () => {
    const html = `<a href="#fixed.php#B5" data-zone="B5">B5</a>`;
    expect(parseZones(html).map((z) => z.code)).toEqual(['B5']);
  });

  it('extracts onclick="#festival.php#X" style', () => {
    const html = `<button onclick="$app.popup.zones('#festival.php#F2')">F2</button>`;
    expect(parseZones(html).map((z) => z.code)).toEqual(['F2']);
  });

  it('deduplicates codes across the three patterns', () => {
    const html = `
      <area href="#fixed.php#A1" />
      <a href="#fixed.php#A1">A1</a>
      <button onclick="$app.popup.zones('#fixed.php#A1')">A1</button>
    `;
    expect(parseZones(html)).toHaveLength(1);
  });

  it('uppercases codes', () => {
    expect(parseZones(`<area href="#fixed.php#a1" />`)[0]!.code).toBe('A1');
  });
});
