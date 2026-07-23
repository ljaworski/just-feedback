import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { relative, resolve } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), 'just-feedback-config-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('session secret persistence', () => {
  it('stores the secret next to an absolute database path', () => {
    const directory = temporaryDirectory();
    const dbPath = resolve(directory, 'feedback.db');

    const first = loadConfig({}, { JF_DB_PATH: dbPath });
    const secretPath = resolve(directory, '.session-secret');

    expect(existsSync(secretPath)).toBe(true);
    expect(readFileSync(secretPath, 'utf8')).toBe(first.sessionSecret);
    expect(loadConfig({}, { JF_DB_PATH: dbPath }).sessionSecret).toBe(first.sessionSecret);
  });

  it('stores the secret next to a relative database path', () => {
    const directory = temporaryDirectory();
    const dbPath = relative(process.cwd(), resolve(directory, 'feedback.db'));

    const config = loadConfig({}, { JF_DB_PATH: dbPath });

    expect(readFileSync(resolve(directory, '.session-secret'), 'utf8')).toBe(config.sessionSecret);
  });
});
