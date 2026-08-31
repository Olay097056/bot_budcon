/**
 * Pure logic tests for BotEngine.
 *
 * We don't launch Firefox or hit the network here — those smoke
 * tests live in `scripts/smoke-bot-engine.ts`. Here we exercise
 * header parsing, options handling, and lifetime bookkeeping.
 */
import { describe, it, expect, vi } from 'vitest';
import { BotEngine } from '../src/bot-engine.js';

describe('BotEngine — header parsing', () => {
  it('returns lowercased keys', async () => {
    // Mock the wreq-js module so the engine never reaches the network.
    vi.doMock('wreq-js', () => ({
      fetch: async () => ({
        status: 200,
        url: 'http://example.com/',
        headers: new Headers({
          'Content-Type': 'text/html',
          'Set-Cookie': 'a=1',
          'X-Akamai-Edge': 'us-east',
        }),
        text: async () => '<html/>',
      }),
    }));
    const engine = new BotEngine();
    try {
      const r = await engine.fetchViaWreq('http://example.com/');
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toBe('text/html');
      expect(r.headers['x-akamai-edge']).toBe('us-east');
    } finally {
      vi.unmock('wreq-js');
    }
  });
});

describe('BotEngine — lifetime', () => {
  it('starts with no context', () => {
    const engine = new BotEngine();
    expect(engine.hasContext()).toBe(false);
  });

  it('close() is idempotent', async () => {
    const engine = new BotEngine();
    await engine.close();
    await engine.close();
    expect(engine.hasContext()).toBe(false);
  });
});
