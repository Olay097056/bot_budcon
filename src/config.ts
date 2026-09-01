/**
 * bot_budcon — configuration.
 *
 * Env-driven paths so the project is portable across host machines
 * and Docker containers without editing code.
 *
 * Precedence:
 *   1. BOT_BUDCON_DATA_DIR (preferred — Docker mount target)
 *   2. $HOME/.bot-budcon-data   (Unix) or %USERPROFILE%\.bot-budcon-data (Win)
 *   3. cwd-relative ./bot-budcon-data (fallback)
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';

function resolveDataDir(): string {
  if (process.env.BOT_BUDCON_DATA_DIR && process.env.BOT_BUDCON_DATA_DIR.trim() !== '') {
    return process.env.BOT_BUDCON_DATA_DIR;
  }
  try {
    const home = homedir();
    if (home && home !== '') return join(home, '.bot-budcon-data');
  } catch {
    // homedir() can throw on some Windows setups when USERPROFILE is missing.
  }
  return join(process.cwd(), 'bot-budcon-data');
}

function ensureDataDir(dir: string): string {
  // Side-effect: mkdir -p the data dir so cookies.json can be
  // written without each caller worrying about existence.
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const config = {
  dataDir: ensureDataDir(resolveDataDir()),
  paths: {
    cookies: join(resolveDataDir(), 'cookies.json'),
    firefoxProfile: join(resolveDataDir(), 'firefox-profile'),
    targets: join(resolveDataDir(), 'targets.json'),
    bookLog: join(resolveDataDir(), 'book.log'),
  },
  server: {
    port: Number(process.env.PORT ?? 7890),
  },
  // BOT_BUDCON_PROXY — residential/mobile proxy to survive Akamai IP
  // reputation blocks (GitHub Actions datacenter IPs are heavily
  // blacklisted). Format: http://user:pass@host:port  or  socks5://...
  // Leave empty for local runs (uses your home IP).
  proxy: (() => {
    const v = (process.env.BOT_BUDCON_PROXY ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? '').trim();
    return v || null;
  })(),
  // TTM — realtime discovery only. No event hardcode.
  // Use GET /api/events/discover (scrapes /concert/ live) as the
  // single source of truth. All targets come from TTM at runtime —
  // nothing is baked into the bundle.
  ttm: {
    signinUrl: process.env.BOT_BUDCON_SIGNIN_URL
      ?? 'https://www.thaiticketmajor.com/user/signin.php',
  },
} as const;

export type Config = typeof config;
