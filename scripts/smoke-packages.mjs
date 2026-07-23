import { spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packWorkspace, run } from './package-utils.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = mkdtempSync(resolve(root, '.package-smoke-'));

function extract(archive, destination) {
  mkdirSync(destination, { recursive: true });
  run('tar', ['-xzf', archive, '--strip-components=1', '-C', destination]);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

async function waitForHealth(port, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Packaged server exited before becoming healthy.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return;
    } catch {
      // The process may still be starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error('Packaged server did not become healthy.');
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolvePromise, reject) => {
    child.once('exit', resolvePromise);
    child.once('error', reject);
  });
}

async function startServer(cli, cwd, port, dbPath) {
  const child = spawn(process.execPath, [cli, 'start', '--port', String(port), '--db', dbPath], {
    cwd,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
  });
  try {
    await waitForHealth(port, child);
    return { child, output: () => output };
  } catch (error) {
    await stop(child);
    throw new Error(`${error.message}\n${output}`);
  }
}

try {
  const archives = resolve(temporaryDirectory, 'archives');
  mkdirSync(archives);
  const sdkPack = packWorkspace(root, archives, '@codelionapps/react-native');
  const serverPack = packWorkspace(root, archives, '@codelionapps/server');

  const sdkDirectory = resolve(
    temporaryDirectory,
    'sdk-consumer/node_modules/@codelionapps/react-native',
  );
  extract(sdkPack.archive, sdkDirectory);
  const sdkConsumer = resolve(temporaryDirectory, 'sdk-consumer');
  writeFileSync(resolve(sdkConsumer, 'package.json'), '{"type":"module"}\n');
  writeFileSync(
    resolve(sdkConsumer, 'smoke.mts'),
    "import { FeedbackProvider, type FeedbackConfig } from '@codelionapps/react-native';\n" +
      "const config: FeedbackConfig = { url: 'https://example.com', apiKey: 'jf_public' };\n" +
      'void FeedbackProvider; void config;\n',
  );
  writeFileSync(
    resolve(sdkConsumer, 'smoke.cts'),
    "import { FeedbackProvider, type FeedbackConfig } from '@codelionapps/react-native';\n" +
      "const config: FeedbackConfig = { url: 'https://example.com', apiKey: 'jf_public' };\n" +
      'void FeedbackProvider; void config;\n',
  );
  const resolvedRequire = run(
    process.execPath,
    ['-e', "process.stdout.write(require.resolve('@codelionapps/react-native'))"],
    { cwd: sdkConsumer },
  );
  if (!resolvedRequire.includes('/lib/commonjs/index.js')) {
    throw new Error(`CommonJS resolved to an unexpected entry: ${resolvedRequire}`);
  }
  const resolvedImport = run(
    process.execPath,
    ['--input-type=module', '-e', "process.stdout.write(import.meta.resolve('@codelionapps/react-native'))"],
    { cwd: sdkConsumer },
  );
  if (!resolvedImport.includes('/lib/module/index.js')) {
    throw new Error(`ESM resolved to an unexpected entry: ${resolvedImport}`);
  }
  run(
    process.execPath,
    [
      resolve(root, 'node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--skipLibCheck',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'smoke.mts',
      'smoke.cts',
    ],
    { cwd: sdkConsumer },
  );
  writeFileSync(
    resolve(sdkConsumer, 'index.js'),
    "import React from 'react';\n" +
      "import { AppRegistry, View } from 'react-native';\n" +
      "import { FeedbackProvider } from '@codelionapps/react-native';\n" +
      "const App = () => React.createElement(FeedbackProvider, { config: { url: 'https://example.com', apiKey: 'jf_public' } }, React.createElement(View));\n" +
      "AppRegistry.registerComponent('JustFeedbackSmoke', () => App);\n",
  );
  writeFileSync(
    resolve(sdkConsumer, 'metro.config.cjs'),
    `const path = require('node:path');\n` +
      `const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');\n` +
      `const root = ${JSON.stringify(root)};\n` +
      `module.exports = mergeConfig(getDefaultConfig(__dirname), {\n` +
      `  watchFolders: [root],\n` +
      `  resolver: { nodeModulesPaths: [path.resolve(__dirname, 'node_modules'), path.resolve(root, 'node_modules')] },\n` +
      `});\n`,
  );
  for (const platform of ['ios', 'android']) {
    run(
      resolve(root, 'node_modules/.bin/metro'),
      [
        'build',
        'index.js',
        '--config',
        'metro.config.cjs',
        '--platform',
        platform,
        '--out',
        resolve(sdkConsumer, `bundle.${platform}.js`),
        '--dev',
        'false',
        '--minify',
        'false',
        '--max-workers',
        '2',
      ],
      { cwd: sdkConsumer },
    );
  }

  const serverDirectory = resolve(
    temporaryDirectory,
    'server-consumer/node_modules/@codelionapps/server',
  );
  extract(serverPack.archive, serverDirectory);
  const serverConsumer = resolve(temporaryDirectory, 'server-consumer');
  const dataDirectory = resolve(serverConsumer, 'data');
  mkdirSync(dataDirectory);
  const dbPath = resolve(dataDirectory, 'feedback.db');
  const cli = resolve(serverDirectory, 'dist/cli.js');

  const firstPort = await freePort();
  const first = await startServer(cli, serverConsumer, firstPort, dbPath);
  const panel = await fetch(`http://127.0.0.1:${firstPort}/`);
  if (!panel.ok || !(await panel.text()).includes('<!doctype html>')) {
    throw new Error('Packaged server did not serve the administrative panel.');
  }
  await stop(first.child);
  const secretPath = resolve(dataDirectory, '.session-secret');
  const firstSecret = readFileSync(secretPath, 'utf8');

  const secondPort = await freePort();
  const second = await startServer(cli, serverConsumer, secondPort, dbPath);
  await stop(second.child);
  if (readFileSync(secretPath, 'utf8') !== firstSecret) {
    throw new Error('Packaged server did not preserve its session secret across restarts.');
  }

  console.log('Packaged SDK resolution/types/Metro bundles and packaged server startup passed.');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
