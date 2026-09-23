FROM node:24.18.0-slim AS build
WORKDIR /app
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH SELF_HOST=true NEXT_PUBLIC_SELF_HOST=true NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=http://127.0.0.1:8080 DATABASE_AUTH_TOKEN=build RESEND_API_KEY=build CRON_SECRET=build AUTH_SECRET=build-only-placeholder-with-32-characters OWNER_EMAIL=owner@example.invalid EMAIL_FROM="Status <status@example.invalid>"
ENV NEXT_PUBLIC_URL=https://status-admin.oeffigo.app
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@openstatus/dashboard
FROM node:24.18.0-slim
WORKDIR /app
ENV NODE_ENV=production SELF_HOST=true NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/dashboard/.next/standalone ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/ops ./ops
COPY --from=build --chown=node:node /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build --chown=node:node /app/apps/dashboard/public ./apps/dashboard/public
USER node
EXPOSE 3000
CMD ["node","apps/dashboard/server.js"]
