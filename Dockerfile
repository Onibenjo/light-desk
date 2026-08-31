# Lightdesk — Coolify / any-Docker deployment.
#
#   docker build -t lightdesk .
#   docker run -p 3000:3000 -v lightdesk-data:/data --env-file .env.local lightdesk
#
# On your own server you don't need Turso: leave TURSO_DATABASE_URL unset and
# the app keeps its cache + log in /data/lightdesk.db — just give the container
# a persistent volume at /data (in Coolify: Storage → Add Volume → /data).
# Set TURSO_DATABASE_URL/TURSO_AUTH_TOKEN instead if you'd rather use Turso.

# ---- build stage ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TURSO_DATABASE_URL=file:/data/lightdesk.db

RUN mkdir /data && chown node:node /data
VOLUME /data

# Next standalone output: server.js + the pruned node_modules it needs.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/unlock').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
