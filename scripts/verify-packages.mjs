import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { packWorkspace } from './package-utils.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'just-feedback-pack-'));

function filePaths(pack) {
  return pack.metadata.files.map(({ path }) => path).sort();
}

function assertIncludes(paths, required, packageName) {
  for (const path of required) {
    if (!paths.includes(path)) {
      throw new Error(`${packageName} is missing ${path}.`);
    }
  }
}

function assertExcludes(paths, forbidden, packageName) {
  const invalid = paths.filter((path) => forbidden.some((pattern) => pattern.test(path)));
  if (invalid.length > 0) {
    throw new Error(`${packageName} contains forbidden files:\n${invalid.join('\n')}`);
  }
}

function recursiveFiles(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = resolve(directory, entry.name);
    return entry.isDirectory()
      ? recursiveFiles(absolute, base)
      : [relative(base, absolute)];
  });
}

try {
  const firstSdk = packWorkspace(root, temporaryDirectory, '@codelionapps/react-native');
  const firstServer = packWorkspace(root, temporaryDirectory, '@codelionapps/server');
  const firstSdkPaths = filePaths(firstSdk);
  const firstServerPaths = filePaths(firstServer);

  assertIncludes(
    firstSdkPaths,
    [
      'LICENSE',
      'README.md',
      'package.json',
      'lib/commonjs/index.js',
      'lib/module/index.js',
      'lib/typescript/commonjs/index.d.ts',
      'lib/typescript/module/index.d.ts',
    ],
    '@codelionapps/react-native',
  );
  assertExcludes(
    firstSdkPaths,
    [/\.test\./, /(^|\/)src\//, /\.db(?:-|$|\.)/, /\.session-secret$/],
    '@codelionapps/react-native',
  );

  assertIncludes(
    firstServerPaths,
    [
      'LICENSE',
      'README.md',
      'package.json',
      'dist/cli.js',
      'dist/panel/index.html',
      'dist/db/migrations/001_init.sql',
    ],
    '@codelionapps/server',
  );
  assertExcludes(
    firstServerPaths,
    [/\.test\./, /(^|\/)src\//, /\.db(?:-|$|\.)/, /\.session-secret$/],
    '@codelionapps/server',
  );

  const panelFiles = recursiveFiles(resolve(root, 'packages/panel/dist'))
    .map((path) => `dist/panel/${path}`)
    .sort();
  const packagedPanelFiles = firstServerPaths.filter((path) => path.startsWith('dist/panel/'));
  if (JSON.stringify(panelFiles) !== JSON.stringify(packagedPanelFiles)) {
    throw new Error('The server package does not contain exactly the current panel build.');
  }

  const secondSdk = packWorkspace(root, temporaryDirectory, '@codelionapps/react-native');
  const secondServer = packWorkspace(root, temporaryDirectory, '@codelionapps/server');
  if (JSON.stringify(firstSdkPaths) !== JSON.stringify(filePaths(secondSdk))) {
    throw new Error('SDK package contents are not deterministic across clean builds.');
  }
  if (JSON.stringify(firstServerPaths) !== JSON.stringify(filePaths(secondServer))) {
    throw new Error('Server package contents are not deterministic across clean builds.');
  }

  console.log(
    `Verified @codelionapps/react-native (${firstSdk.metadata.entryCount} files) and ` +
      `@codelionapps/server (${firstServer.metadata.entryCount} files).`,
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
