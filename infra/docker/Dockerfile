FROM node:22.23.1-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV COREPACK_HOME="/opt/corepack"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates git openssl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /pnpm /opt/corepack \
    && corepack enable --install-directory /pnpm \
    && corepack prepare pnpm@10.15.1 --activate \
    && chmod -R a+rX /opt/corepack /pnpm
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/codex/package.json packages/codex/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/github/package.json packages/github/package.json
COPY packages/security/package.json packages/security/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
ARG FILTER
COPY . .
RUN pnpm --filter @sandeul/database generate
RUN pnpm --filter "${FILTER}..." build
RUN pnpm --filter "${FILTER}" --prod deploy --legacy /runtime
RUN schema_path="$(find /runtime -path '*/prisma/schema.prisma' -print -quit)" \
    && if [ -n "$schema_path" ]; then \
      prisma_cli="$(find /runtime -path '*/prisma/build/index.js' -print -quit)"; \
      node "$prisma_cli" generate --schema "$schema_path"; \
    fi

FROM node:22.23.1-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
    && mkdir -p /var/lib/factory-workspaces \
    && chown node:node /var/lib/factory-workspaces
COPY --chown=node:node --from=builder /runtime /app
COPY --chown=node:node --from=builder /workspace/schemas /app/schemas
ARG FILTER
ENV APP_FILTER="${FILTER}"
USER node
CMD ["sh", "-c", "case \"$APP_FILTER\" in '@sandeul/web') exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 ;; '@sandeul/database') exec node node_modules/prisma/build/index.js migrate deploy ;; *) exec node dist/main.js ;; esac"]
