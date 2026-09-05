# Lightdesk — Coolify / any-Docker deployment.
#
#   docker build -t lightdesk .
#   docker run -p 3000:3000 -v lightdesk-data:/data --env-file .env.local lightdesk
#
# ---------------------------------------------------------------------------
# Where the data lives
# ---------------------------------------------------------------------------
# Default: a SQLite file at /data/lightdesk.db. Give the container a persistent
# volume at /data (Coolify: Storage → Add Volume → /data) or every redeploy
# starts empty.
#
# Turso instead: set TURSO_DATABASE_URL=libsql://<db>.turso.io and
# TURSO_AUTH_TOKEN=<token> in Coolify's environment. Those override the default
# below, so it is a config change with no rebuild, and unsetting them goes back
# to the volume.
#
# MIGRATE THE DATA FIRST. An empty Turso database looks like it worked —
# ensureSchema() happily creates the tables and the app starts clean, silently
# losing the log. On the host, before switching the env vars:
#
#   docker exec <container> node scripts/db-backup.mts \
#     --url file:/data/lightdesk.db --out /tmp
#   docker cp <container>:/tmp/lightdesk-<stamp>.json ./
#   docker exec -e TURSO_AUTH_TOKEN=… <container> node scripts/db-restore.mts \
#     --file /tmp/lightdesk-<stamp>.json --url libsql://<db>.turso.io
#
# The restore prints a row count per table and exits non-zero if anything is
# short, so check it rather than assuming.
#
# Back up either way. Replication saves you from a dead server, not from a bad
# import. Copy the file OFF the box — a backup sitting in /data dies with the
# volume it was meant to insure:
#
#   docker exec <container> node scripts/db-backup.mts --out /tmp
#   docker cp <container>:/tmp/lightdesk-<stamp>.json ~/lightdesk-backups/
# Of the four tables only sent_log is truly irreplaceable: songs re-import from
# the VideoPsalm files and verse_cache rebuilds itself.

# ---- build stage ----
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:24-bookworm-slim AS runner
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
# Ops scripts, so backup/restore can run with `docker exec` against the live
# volume. Node 24 strips the types, so these run without a build step; they need
# only these two modules, not the whole of src/.
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/src/db/schemaSql.ts ./src/db/schemaSql.ts
COPY --from=builder --chown=node:node /app/src/lib/dbTransfer.ts ./src/lib/dbTransfer.ts

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:3000/unlock').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
