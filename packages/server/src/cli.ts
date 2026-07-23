#!/usr/bin/env node
import { start } from './start';
import type { CliOverrides } from './config';

function parseArgs(argv: string[]): { command: string; overrides: CliOverrides } {
  const overrides: CliOverrides = {};
  let command = 'start';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'start') command = 'start';
    else if (a === '--port') overrides.port = Number(argv[++i]);
    else if (a === '--db') overrides.dbPath = argv[++i];
  }
  return { command, overrides };
}

async function main(): Promise<void> {
  const { command, overrides } = parseArgs(process.argv.slice(2));
  if (command !== 'start') {
    console.error('Usage: just-feedback start [--port <n>] [--db <path>]');
    process.exit(1);
  }
  const server = await start(overrides);
  const shutdown = async () => {
    await server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[just-feedback] failed to start:', err.message ?? err);
  process.exit(1);
});
