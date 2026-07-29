FROM node:22.18.0-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
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

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=builder /workspace /workspace
ARG FILTER
ENV APP_FILTER="${FILTER}"
CMD ["sh", "-c", "pnpm --filter \"$APP_FILTER\" start"]
