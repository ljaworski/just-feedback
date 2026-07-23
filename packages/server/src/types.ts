import 'fastify';
import type { DB } from './db';
import type { Config } from './config';
import type { AppState } from './state';

declare module 'fastify' {
  interface FastifyInstance {
    db: DB;
    config: Config;
    state: AppState;
  }
}
