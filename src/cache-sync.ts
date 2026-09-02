/**
 * Sync local discover-cache.json → cache/discover-cache.json and commit+push.
 * Run after a successful live discover so cloud runners / fresh clones can
 * hydrate for free (ticket 18). Silent success, one-line log on change.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const LOCAL = resolve(process.env.BOT_BUDCON_DATA_DIR ?? joinDot(), 'discover-cache.json');
const REPO = resolve('cache/discover-cache.json');

function joinDot(): string {
  // mirror config.resolveDataDir without importing config (script standalone)
  const home = process.env.USERPROFILE ?? process.env.HOME ?? process.cwd();
  return home + '/.bot-budcon-data';
}

function gitOK(cmd: string): boolean {
  try { execSync(cmd, { stdio: 'pipe', timeout: 30_000 }); return true; } catch { return false; }
}

try {
  if (!existsSync(LOCAL)) process.exit(0);
  mkdirSync('cache', { recursive: true });

  // Only copy when content differs (avoid pointless commits).
  let changed = true;
  if (existsSync(REPO)) {
    changed = readFileSync(LOCAL, 'utf-8') !== readFileSync(REPO, 'utf-8');
  }
  if (!changed) process.exit(0);

  copyFileSync(LOCAL, REPO);
  if (!gitOK('git rev-parse --is-inside-work-tree')) process.exit(0);
  gitOK('git add cache/discover-cache.json');
  const staged = execSync('git diff --cached --name-only', { encoding: 'utf-8', timeout: 15_000 });
  if (!staged.includes('discover-cache')) process.exit(0); // nothing staged → same content
  gitOK('git -c user.name="bot-budcon" -c user.email="bot@local" commit -m "chore(cache): refresh discover-cache from local run [skip ci]"');
  gitOK('git push');
  console.log('[cache-sync] committed fresh discover-cache.json → cache/');
} catch (e) {
  // Never crash the server over cache sync — it is a best-effort side channel.
  console.log(`[cache-sync] skipped: ${e instanceof Error ? e.message : e}`);
}
