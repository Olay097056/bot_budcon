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
  // TTM target — overridable for tests; do NOT hard-code in production.
  ttm: {
    signinUrl: process.env.BOT_BUDCON_SIGNIN_URL
      ?? 'https://www.thaiticketmajor.com/user/signin.php',
    /**
     * Known on-sale events as of session close (2026-08-31).
     * Use BOT_BUDCON_TARGET to pick one for the watch loop:
     *   BOT_BUDCON_TARGET=idol1st  BOT_BUDCON_TARGET=lany
     *   BOT_BUDCON_TARGET=joji     BOT_BUDCON_TARGET=babymonster
     *   BOT_BUDCON_TARGET=dreaming
     * The `query` field is the trailing path segment TTM uses for
     * `booking/3m/zones.php?query=<x>`. The `event` field is the
     * slug TTM uses for the public concert page.
     */
    targets: {
      idol1st: {
        event: 'idol1st-kenty-asia-tour-2026-in-bangkok',
        query: '504',
      },
      lany: {
        event: 'lany-soft-world-tour-bangkok',
        query: 'lany',
      },
      joji: {
        event: 'joji-solaris-tour-2026',
        query: 'joji',
      },
      babymonster: {
        event: '2026-27-babymonster-world-tour-choom-in-bangkok',
        query: 'babymonster',
      },
      dreaming: {
        event: 'dreaming-tomohisa-yamashita-tour-2026-live-in-bangkok',
        query: 'dreaming',
      },
    } as const,
    /** BOT_BUDCON_TARGET overrides the default watch target. */
    targetKey: (process.env.BOT_BUDCON_TARGET ?? 'idol1st') as
      | 'idol1st' | 'lany' | 'joji' | 'babymonster' | 'dreaming',
  },
} as const;

export type Config = typeof config;
