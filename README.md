# just-feedback

Self-hosted feedback collection for mobile apps. Everything runs in a single Node process: the REST API, web panel, and SQLite database. No Redis or external services required.

- **Server** — `@codelionapps/server` (npm), which includes the client API, admin panel, and database.
- **Panel** — a React SPA bundled with the server, with Polish and English UI.
- **SDK** — `@codelionapps/react-native` (npm), a ready-to-use feedback modal that requires no native code and works in Expo Go.

## Quickstart (server)

```bash
npx @codelionapps/server start
```

No secrets or configuration are required to get started. On its first run, the server:

1. creates/migrates the SQLite database (`./just-feedback.db`),
2. listens on `http://localhost:4180`,
3. prints a **one-time setup link** to the logs:

```
Setup required. Open this one-time link (host may differ for remote deploys):
http://localhost:4180/onboarding#setup=<token>
```

Open the link, choose an admin password, and create your first project and API key. The setup token is kept only in memory: it becomes invalid after onboarding and a new one is generated if the server restarts before setup is complete.

For a remote host, swap `localhost` for your host (or paste just the token into the onboarding form).

### Optional bootstrap password

You can skip choosing a password in the browser by setting one in advance (at least 8 characters):

```bash
JF_ADMIN_PASSWORD='change-me-please' npx @codelionapps/server start
```

Once onboarding is complete, `JF_ADMIN_PASSWORD` is **ignored** on later starts. The password is stored as a hash in the database, so changing the environment variable does not change the login password.

### Persist the database

All application data is stored in the SQLite file at `JF_DB_PATH` (default: `./just-feedback.db`, using WAL mode). Back up this file or keep it on a persistent volume. The server also creates a `.session-secret` file next to it for signing session cookies.

## Configuration (env)

| Variable | Default | Description |
|---|---|---|
| `JF_ADMIN_PASSWORD` | — | Optional bootstrap password for first onboarding (min 8 chars). Ignored after setup. |
| `JF_SESSION_SECRET` | generated → `.session-secret` | Cookie signing secret. |
| `JF_DB_PATH` | `./just-feedback.db` | SQLite file path. |
| `JF_PORT` | `4180` | HTTP port. |
| `JF_HOST` | `0.0.0.0` | Bind address. |
| `JF_RATE_LIMIT_PER_MINUTE` | `10` | `POST /api/v1/feedback` limit per API key. |
| `JF_TRUST_PROXY` | `false` | Set `true` behind a reverse proxy (correct client IP). |
| `JF_ADMIN_PORT` | — | If set, panel + `/api/admin/*` move to this port; the main port serves only `/api/v1/*`. |

CLI flags `--port` and `--db` override the env.

## Deployment

The client endpoint `POST /api/v1/feedback` **must be reachable from the public internet**, since it is called by apps running on users' devices. We recommend handling HTTPS with a reverse proxy.

### Caddy (simplest)

```
feedback.example.com {
    reverse_proxy localhost:4180
}
```

The public attack surface is small: one API-key-protected, rate-limited POST endpoint and a password-protected, rate-limited admin login.

### Optional hardening after the MVP (no code changes)

- Expose only `/api/v1/*` publicly; restrict `/` and `/api/admin/*` in the proxy to an IP allowlist / VPN / basic auth.
- Or split ports with `JF_ADMIN_PORT`: public port = client API only, admin on a private port behind a firewall.

### Docker

The published image contains the complete service: REST API, web panel, and SQLite database.

```bash
docker run -d \
  --name just-feedback \
  --restart unless-stopped \
  -p 4180:4180 \
  -v just-feedback-data:/data \
  ghcr.io/ljaworski/just-feedback:latest
```

Or clone the repository and start the same image through Compose:

```bash
cp .env.example .env
docker compose up -d
```

To build from the checked-out source instead:

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

For a fully reproducible deployment, replace `latest` in `.env` with a released server version.
The image is published for Linux AMD64 and ARM64.

To build and run the image without Compose:

```bash
docker build -t just-feedback .

docker run -d \
  --name just-feedback \
  --restart unless-stopped \
  -p 4180:4180 \
  -v just-feedback-data:/data \
  just-feedback
```

The server is then available at `http://localhost:4180`. On the first start, read the container
logs to get the one-time onboarding link:

```bash
docker logs just-feedback
```

The named volume stores the SQLite database and session secret, so application data survives
container restarts and replacement. To use a host directory instead, replace the volume argument
with `-v "$PWD/data:/data"`. The image already sets `JF_DB_PATH=/data/just-feedback.db`.

Common container commands:

```bash
docker logs -f just-feedback
docker stop just-feedback
docker start just-feedback
```

For a public deployment, put the container behind an HTTPS reverse proxy. Publishing port `4180`
directly is intended primarily for local use or for a host where access is otherwise restricted.
Container health is reported by `GET /healthz` and by the built-in Docker healthcheck.

### systemd

```ini
[Service]
ExecStart=/usr/bin/npx @codelionapps/server start
Environment=JF_DB_PATH=/var/lib/just-feedback/db.sqlite
Restart=always
```

## SDK (React Native / Expo)

```bash
npm install @codelionapps/react-native
```

```tsx
import { FeedbackProvider, useFeedback } from '@codelionapps/react-native';

export default function Root() {
  return (
    <FeedbackProvider config={{ url: 'https://feedback.example.com', apiKey: 'jf_...' }}>
      <App />
    </FeedbackProvider>
  );
}

function ReportButton() {
  const { openFeedback } = useFeedback();
  return <Button title="Send feedback" onPress={openFeedback} />;
}
```

`platform` and `osVersion` are added automatically. For the full API—including `FeedbackModal`, `sendFeedback`, and copy and style overrides—see `packages/sdk-react-native`.

## Development (monorepo)

```bash
npm install          # installs all workspaces
npm test             # server + panel + sdk tests
npm run build        # panel -> server/dist/panel -> sdk
npm run typecheck    # all TypeScript workspaces
npm run verify:packages
npm run smoke:packages
```

Public packages are independently versioned with Changesets. Maintainers should read
[`RELEASING.md`](./RELEASING.md) before the first npm or GHCR publication.

Run the server against the panel dev server:

```bash
npm run dev -w @codelionapps/server   # API on :4180
npm run dev -w @codelionapps/panel    # Vite on :5173, proxies /api -> :4180
```
