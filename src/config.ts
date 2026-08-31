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

export const config = {
  dataDir: resolveDataDir(),
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
    // Populated by ticket 03 (site recon).
  },
} as const;

export type Config = typeof config;
