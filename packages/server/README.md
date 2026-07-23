# @codelionapps/server

Self-hosted feedback backend containing the REST API, administrative web panel, SQLite database,
and migrations in one Node.js process.

## Quick start

Node.js 20 or newer is required.

```sh
npx @codelionapps/server start
```

The service listens on `http://localhost:4180`, creates `./just-feedback.db`, applies migrations,
and prints a one-time onboarding link. To keep data in a known location:

```sh
npx @codelionapps/server start --db /var/lib/just-feedback/feedback.db --port 4180
```

For long-running production installations, the published Docker image is recommended:

```sh
docker run -d \
  --name just-feedback \
  --restart unless-stopped \
  -p 4180:4180 \
  -v just-feedback-data:/data \
  ghcr.io/ljaworski/just-feedback:latest
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `JF_ADMIN_PASSWORD` | unset | Optional first-run password, minimum 8 characters. |
| `JF_SESSION_SECRET` | persisted beside DB | Explicit cookie-signing secret. |
| `JF_DB_PATH` | `./just-feedback.db` | SQLite database path. |
| `JF_PORT` | `4180` | Public HTTP port. |
| `JF_HOST` | `0.0.0.0` | Bind address. |
| `JF_ADMIN_PORT` | unset | Optional separate port for the panel and admin API. |
| `JF_RATE_LIMIT_PER_MINUTE` | `10` | Feedback submissions allowed per key and minute. |
| `JF_TRUST_PROXY` | `false` | Set to `true` behind a trusted reverse proxy. |

`GET /healthz` returns service readiness. Use HTTPS through a reverse proxy for public deployments.

## Data

The database, WAL files, and generated `.session-secret` belong on persistent storage. Back up the
database file regularly. The server has no Redis or external database dependency.

## License

MIT
