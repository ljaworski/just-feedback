# syntax=docker/dockerfile:1

FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/server/package.json packages/server/
COPY packages/panel/package.json packages/panel/
COPY packages/sdk-react-native/package.json packages/sdk-react-native/
RUN npm ci

COPY scripts scripts
COPY packages/panel packages/panel
COPY packages/server packages/server
RUN npm run build -w @codelionapps/server

FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV JF_DB_PATH=/data/just-feedback.db

COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
COPY packages/panel/package.json packages/panel/
COPY packages/sdk-react-native/package.json packages/sdk-react-native/

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci --omit=dev --workspace @codelionapps/server --include-workspace-root=false \
 && apt-get purge -y python3 make g++ \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/* \
 && npm cache clean --force \
 && mkdir -p /data \
 && chown node:node /data

COPY --from=build --chown=node:node /app/packages/server/dist packages/server/dist

USER node
VOLUME /data
EXPOSE 4180
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.JF_PORT||4180)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "packages/server/dist/cli.js", "start"]
