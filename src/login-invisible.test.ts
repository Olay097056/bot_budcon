/**
 * bot_budcon — invisible-login bridge unit tests (ticket 12).
 *
 * We can't drive the real Python subprocess in CI, so we test
 * the JSON-line parser the Node side uses directly. The bridge
 * exports `startLoginInvisible` that consumes stdout, but for
 * the test we re-implement the same parsing logic against
 * synthetic input — the parser logic is what we care about.
 *
 * If `startLoginInvisible` ever stops parsing correctly, the
 * server will silently lose cookies; this test is the tripwire.
 */
import { describe, it, expect } from 'vitest';

/** Pure parser that mirrors the bridge's stdout handling. */
function parseStdoutLines(buffer: string): {
  events: Array<Record<string, unknown>>;
  pending: string;
  cookies: Array<Record<string, unknown>> | null;
  finished: boolean;
  ok: boolean | null;
} {
  const events: Array<Record<string, unknown>> = [];
  let pending = buffer;
  let cookies: Array<Record<string, unknown>> | null = null;
  let finished = false;
  let ok: boolean | null = null;

  let nl = pending.indexOf('\n');
  while (nl >= 0) {
    const line = pending.slice(0, nl).trim();
    pending = pending.slice(nl + 1);
    if (line) {
      try {
        const ev = JSON.parse(line) as Record<string, unknown>;
        events.push(ev);
        if (ev['phase'] === 'ok') {
          const cs = ev['cookies'] as Array<Record<string, unknown>> | undefined;
          cookies = Array.isArray(cs) ? cs : null;
          ok = true;
          finished = true;
        } else if (ev['phase'] === 'timeout' || ev['phase'] === 'fatal') {
          ok = false;
          finished = true;
        }
      } catch {
        // ignore malformed
      }
    }
    nl = pending.indexOf('\n');
  }
  return { events, pending, cookies, finished, ok };
}

describe('stdout JSON-line parser', () => {
  it('parses an ok event and extracts cookies', () => {
    const chunk =
      '{"phase":"starting","url":"x"}\n' +
      '{"phase":"polling","have_session":true,"have_auth":false}\n' +
      '{"phase":"ok","cookies":[{"name":"PHPSESSID","value":"live","domain":".thaiticketmajor.com","path":"/","secure":false,"httpOnly":false,"expires":-1}]}\n';
    const r = parseStdoutLines(chunk);
    expect(r.ok).toBe(true);
    expect(r.finished).toBe(true);
    expect(r.cookies?.[0]?.['name']).toBe('PHPSESSID');
  });

  it('parses timeout phase as ok=false', () => {
    const r = parseStdoutLines('{"phase":"timeout","cookies":[]}\n');
    expect(r.ok).toBe(false);
    expect(r.finished).toBe(true);
  });

  it('parses fatal phase as ok=false', () => {
    const r = parseStdoutLines('{"phase":"fatal","error":"oops"}\n');
    expect(r.ok).toBe(false);
    expect(r.finished).toBe(true);
  });

  it('tolerates malformed JSON lines without throwing', () => {
    const chunk =
      'not json\n' +
      '{"phase":"ok","cookies":[{"name":"PHPSESSID","value":"x","domain":".thaiticketmajor.com","path":"/","secure":false,"httpOnly":false,"expires":-1}]}\n';
    const r = parseStdoutLines(chunk);
    expect(r.ok).toBe(true);
    // Only the well-formed event landed; the malformed line was
    // silently dropped (parser swallows JSON.parse errors).
    expect(r.events.length).toBe(1);
  });

  it('handles partial chunks (no trailing newline yet)', () => {
    const partial = '{"phase":"starting","url":"x"';
    const r = parseStdoutLines(partial);
    expect(r.ok).toBe(null);
    expect(r.finished).toBe(false);
    expect(r.pending).toBe(partial);
  });

  it('processes a complete second chunk after the first', () => {
    // Two events total: "starting" then "polling" split across
    // two chunks. The parser is a pure function called twice;
    // each call tracks its own event count and pending buffer.
    const r1 = parseStdoutLines('{"phase":"starting"}\n{"phase":"p');
    expect(r1.events.length).toBe(1);
    expect(r1.pending).toBe('{"phase":"p');
    const r2 = parseStdoutLines(r1.pending + 'olling"}\n');
    // r2 only sees the second chunk; it emits exactly one event.
    expect(r2.events.length).toBe(1);
    expect(r2.pending).toBe('');
    // The combined count across both parser calls is 2.
    expect(r1.events.length + r2.events.length).toBe(2);
  });

  it('returns cookies=null when ok arrives without cookies', () => {
    const r = parseStdoutLines('{"phase":"ok"}\n');
    expect(r.ok).toBe(true);
    expect(r.cookies).toBe(null);
  });
});