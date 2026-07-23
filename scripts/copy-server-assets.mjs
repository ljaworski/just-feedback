import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const panelSource = resolve(root, 'packages/panel/dist');
const panelEntry = resolve(panelSource, 'index.html');
const migrationsSource = resolve(root, 'packages/server/src/db/migrations');
const serverDist = resolve(root, 'packages/server/dist');

if (!existsSync(serverDist)) {
  throw new Error('Server compilation did not create packages/server/dist.');
}
if (!existsSync(panelEntry)) {
  throw new Error('Panel build is missing packages/panel/dist/index.html.');
}
if (!existsSync(migrationsSource)) {
  throw new Error('Server migrations directory is missing.');
}

const panelTarget = resolve(serverDist, 'panel');
const migrationsTarget = resolve(serverDist, 'db/migrations');
rmSync(panelTarget, { recursive: true, force: true });
rmSync(migrationsTarget, { recursive: true, force: true });
cpSync(panelSource, panelTarget, { recursive: true });
cpSync(migrationsSource, migrationsTarget, { recursive: true });
