/**
 * bot_budcon — zone parser.
 *
 * Pulled out of `watch.ts` so the parsing logic is unit-testable
 * without touching Playwright. The actual TTM zone pages may serve
 * either server-rendered HTML or a SPA shell — both are
 * represented in the tests below as opaque text fixtures.
 */

export interface ZoneMatch {
  /** The unique zone id from the page anchor (`#fixed.php#<code>`). */
  code: string;
  /** The full href the click target should resolve to. */
  href: string;
}

/**
 * Extract zones from a zones.php-style HTML response.
 *
 * TTM pages include anchors like
 *   <area href="#fixed.php#A1" ...>
 * or sometimes links rendered by client-side JS as
 *   <a href="#fixed.php#A1" data-zone="A1">A1</a>
 * We accept both, plus the same for `#festival.php#<code>`.
 */
export function parseZones(html: string): ZoneMatch[] {
  const out: ZoneMatch[] = [];
  const seen = new Set<string>();
  // Match anchors (image-map and link styles). We only require the
  // href to start with `#fixed.php#` or `#festival.php#` — no other
  // shape restrictions, since real TTM HTML has been observed to vary.
  const patterns: RegExp[] = [
    /<(?:area|a)\b[^>]*href=["'](#(?:fixed|festival)\.php#[^"']+)["'][^>]*>/gi,
    // onclick patterns can carry arbitrary JS prefixes/suffixes
    // (`$app.popup.zones('...')`, `void(0)` etc.). We just look for
    // the #fixed.php# / #festival.php# token followed by the code.
    /#(?:fixed|festival)\.php#([A-Za-z0-9]+)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      // For the anchor regex, capture group 1 is the full href.
      // For the onclick regex, capture group 1 is just the code.
      const raw = m[1] ?? '';
      const isAnchorPattern = raw.startsWith('#');
      const href = isAnchorPattern ? raw : `#fixed.php#${raw}`;
      const codeMatch = href.match(/#[^#]+#(.+)$/);
      if (!codeMatch) continue;
      const code = codeMatch[1]!.toUpperCase();
      if (seen.has(code)) continue;
      seen.add(code);
      out.push({ code, href });
    }
  }
  return out;
}
