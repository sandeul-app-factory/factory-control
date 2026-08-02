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

FROM golang:1.26.4-bookworm AS osv-builder
ARG OSV_SCANNER_VERSION=2.4.0
RUN CGO_ENABLED=0 go install github.com/google/osv-scanner/v2/cmd/osv-scanner@v${OSV_SCANNER_VERSION}

FROM node:22.23.1-bookworm-slim AS worker-runtime
ARG CODEX_CLI_VERSION=0.146.0
ARG ANDROID_COMMAND_LINE_TOOLS=11076708
ARG ANDROID_PLATFORM=36
ARG ANDROID_BUILD_TOOLS=36.0.0
ARG GITLEAKS_VERSION=8.30.1
ARG TRIVY_VERSION=0.72.0
ARG SYFT_VERSION=1.49.0
ARG SEMGREP_VERSION=1.172.0
ENV NODE_ENV=production \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 \
    GRADLE_USER_HOME=/var/lib/factory-gradle \
    CODEX_HOME=/home/node/.codex \
    CODEX_WORKSPACE_ROOT=/srv/factory-workspaces \
    PNPM_HOME=/opt/pnpm \
    PATH=/opt/pnpm:/opt/semgrep/bin:/opt/android-sdk/platform-tools:/opt/android-sdk/cmdline-tools/latest/bin:$PATH
WORKDIR /app
RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends \
      ca-certificates curl git openjdk-17-jdk-headless python3 python3-venv tar unzip \
    && npm install --global "@openai/codex@${CODEX_CLI_VERSION}" \
    && mkdir -p /opt/pnpm /opt/android-sdk/cmdline-tools /opt/semgrep \
    && corepack enable --install-directory /opt/pnpm \
    && corepack prepare pnpm@10.15.1 --activate \
    && python3 -m venv /opt/semgrep \
    && /opt/semgrep/bin/pip install --no-cache-dir "semgrep==${SEMGREP_VERSION}" \
    && curl -fsSLo /tmp/android-tools.zip "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_COMMAND_LINE_TOOLS}_latest.zip" \
    && unzip -q /tmp/android-tools.zip -d /tmp/android-tools \
    && mv /tmp/android-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest \
    && yes | sdkmanager --licenses >/dev/null \
    && sdkmanager "platform-tools" "platforms;android-${ANDROID_PLATFORM}" "build-tools;${ANDROID_BUILD_TOOLS}" \
    && curl -fsSLo /tmp/gitleaks.tar.gz "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
    && curl -fsSLo /tmp/trivy.tar.gz "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" \
    && curl -fsSLo /tmp/syft.tar.gz "https://github.com/anchore/syft/releases/download/v${SYFT_VERSION}/syft_${SYFT_VERSION}_linux_amd64.tar.gz" \
    && tar -xzf /tmp/gitleaks.tar.gz -C /usr/local/bin gitleaks \
    && tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy \
    && tar -xzf /tmp/syft.tar.gz -C /usr/local/bin syft \
    && mkdir -p /srv/factory-workspaces /var/lib/factory-gradle /home/node/.codex \
    && chown -R node:node /srv/factory-workspaces /var/lib/factory-gradle /home/node/.codex \
    && rm -rf /tmp/* /var/lib/apt/lists/*
COPY --from=osv-builder /go/bin/osv-scanner /usr/local/bin/osv-scanner
COPY --chown=node:node --from=builder /runtime /app
COPY --chown=node:node --from=builder /workspace/schemas /app/schemas
USER node
CMD ["node", "dist/main.js"]
