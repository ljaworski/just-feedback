import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed\n${result.stdout ?? ''}${result.stderr ?? ''}`,
    );
  }
  return result.stdout;
}

export function packWorkspace(root, destination, workspace) {
  const output = run(
    'npm',
    ['pack', '--json', '--pack-destination', destination, '--workspace', workspace],
    {
      cwd: root,
      env: {
        ...process.env,
        npm_config_cache: resolve(destination, '.npm-cache'),
      },
    },
  );
  const jsonStart = output.lastIndexOf('\n[\n');
  const json = jsonStart === -1 ? output : output.slice(jsonStart + 1);
  const metadata = JSON.parse(json)[0];
  if (!metadata?.filename || !Array.isArray(metadata.files)) {
    throw new Error(`npm pack returned invalid metadata for ${workspace}.`);
  }
  return {
    archive: resolve(destination, metadata.filename),
    metadata,
  };
}
