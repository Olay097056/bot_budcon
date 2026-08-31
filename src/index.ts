/**
 * bot_budcon — CLI entry point.
 *
 * Subcommands wire up in their own tickets:
 *   - `login` (ticket 04)
 *   - `watch` (ticket 05)
 *   - `ui`    (ticket 06)
 *
 * For now this only exports the engine so ticket 02 can be smoke-
 * tested from a script without a UI.
 */
export { BotEngine } from './bot-engine.js';

async function main(): Promise<void> {
  const subcommand = process.argv[2];
  if (subcommand !== undefined) {
    // eslint-disable-next-line no-console
    console.error(`unknown subcommand: ${subcommand}`);
    // eslint-disable-next-line no-console
    console.error('available subcommands: (none yet — see .wayfinder/tickets/)');
    process.exit(2);
  }
  // eslint-disable-next-line no-console
  console.log('bot_budcon: no subcommand given. import BotEngine from "./bot-engine.js" to drive it.');
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error('fatal:', e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
