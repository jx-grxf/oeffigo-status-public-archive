FROM node:24.18.0-slim AS age
ARG TARGETARCH=amd64
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    case "$TARGETARCH" in \
      amd64) checksum=cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10 ;; \
      arm64) checksum=6b8dc4333c53a5a57c9e5834e3a48f92605d7154014cd07269ff3327db5d37f4 ;; \
      *) exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/FiloSottile/age/releases/download/v1.3.2/age-v1.3.2-linux-${TARGETARCH}.tar.gz" -o /tmp/age.tar.gz; \
    echo "$checksum  /tmp/age.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/age.tar.gz -C /tmp; \
    install -m 755 /tmp/age/age /usr/local/bin/age

FROM node:24.18.0-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN node --test apps/status-backup/src/*.test.mjs

FROM node:24.18.0-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=age /usr/local/bin/age /usr/local/bin/age
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/status-backup ./apps/status-backup
USER node
CMD ["node", "apps/status-backup/src/index.mjs"]
