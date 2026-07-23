import type { FastifyInstance } from 'fastify';
import { loadConfig, type CliOverrides } from './config';
import { openDb } from './db';
import { buildApp } from './app';
import { adminExists, newSetupToken, type AppState } from './state';

export interface RunningServer {
  apps: FastifyInstance[];
  close: () => Promise<void>;
}

/** Boot the database + one or two Fastify instances and start listening. */
export async function start(overrides: CliOverrides = {}): Promise<RunningServer> {
  const config = loadConfig(overrides);
  const { db, migrationsApplied } = openDb(config.dbPath);

  const initialized = adminExists(db);

  // Validate the bootstrap password only for an uninitialized instance.
  if (!initialized && config.adminPassword && config.adminPassword.length < 8) {
    throw new Error('JF_ADMIN_PASSWORD must be at least 8 characters.');
  }
  if (initialized && config.adminPassword) {
    console.warn(
      '[just-feedback] JF_ADMIN_PASSWORD is ignored: this instance is already initialized.',
    );
  }

  const state: AppState = {
    setupToken: initialized ? null : newSetupToken(),
    bootstrapPassword: !initialized ? config.adminPassword : null,
  };

  const apps: FastifyInstance[] = [];
  if (config.adminPort) {
    const clientApp = await buildApp({ db, config, state, mode: 'client' });
    const adminApp = await buildApp({ db, config, state, mode: 'admin' });
    await clientApp.listen({ port: config.port, host: config.host });
    await adminApp.listen({ port: config.adminPort, host: config.host });
    apps.push(clientApp, adminApp);
  } else {
    const app = await buildApp({ db, config, state, mode: 'all' });
    await app.listen({ port: config.port, host: config.host });
    apps.push(app);
  }

  // Startup summary.
  console.log(`[just-feedback] listening on http://${config.host}:${config.port}`);
  if (config.adminPort) {
    console.log(`[just-feedback] admin + panel on http://${config.host}:${config.adminPort}`);
  }
  console.log(`[just-feedback] database: ${config.dbPath} (${migrationsApplied} migration(s) applied)`);

  if (!initialized) {
    const adminPort = config.adminPort ?? config.port;
    console.log(
      '\n' +
        '  Setup required. Open this one-time link (host may differ for remote deploys):\n' +
        `  http://localhost:${adminPort}/onboarding#setup=${state.setupToken}\n` +
        (state.bootstrapPassword
          ? '  Admin password comes from JF_ADMIN_PASSWORD.\n'
          : '  You will choose an admin password during onboarding.\n'),
    );
  }

  return {
    apps,
    close: async () => {
      await Promise.all(apps.map((a) => a.close()));
      db.close();
    },
  };
}
