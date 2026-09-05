#!/usr/bin/env bash
#
# Weekly backup, kept on the host.
#
# Runs the dump inside the running container and copies the file out onto the
# host filesystem, because a backup living in the same volume it insures is not
# a backup. Works for either storage backend: the container's own
# TURSO_DATABASE_URL decides whether it dumps the volume or Turso.
#
# Install (host crontab) — Sundays 22:00, after the evening service:
#
#   crontab -e
#   0 22 * * 0 /path/to/lightdesk/scripts/backup-cron.sh >> /var/log/lightdesk-backup.log 2>&1
#
# Override any of these with environment variables:
set -euo pipefail

CONTAINER="${LIGHTDESK_CONTAINER:-lightdesk}"
DEST="${LIGHTDESK_BACKUP_DIR:-$HOME/lightdesk-backups}"
KEEP="${LIGHTDESK_BACKUP_KEEP:-8}"   # ~2 months of weekly backups

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
fail() { log "FAILED: $*"; exit 1; }

command -v docker >/dev/null 2>&1 || fail "docker not on PATH"
docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true \
  || fail "container '$CONTAINER' is not running (set LIGHTDESK_CONTAINER)"

mkdir -p "$DEST"

# --out /tmp inside the container; no --url, so the container's own env picks
# the database. Nothing is written to the volume.
log "dumping from container '$CONTAINER'"
docker exec "$CONTAINER" node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON \
  scripts/db-backup.mts --out /tmp >/dev/null || fail "dump failed"

REMOTE=$(docker exec "$CONTAINER" sh -c 'ls -1 /tmp/lightdesk-*.json 2>/dev/null | sort -r | head -1')
[ -n "$REMOTE" ] || fail "no dump file produced"

NAME=$(basename "$REMOTE")
docker cp "$CONTAINER:$REMOTE" "$DEST/$NAME" || fail "copy to host failed"
docker exec "$CONTAINER" rm -f "$REMOTE" || log "warning: could not clean up $REMOTE"

# A backup nobody reads is a backup nobody can trust: parse it and report the
# counts, so a silently empty dump is loud rather than discovered at restore time.
COUNTS=$(node -e '
  const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (d.version !== 1) { console.error("unexpected version " + d.version); process.exit(1); }
  const t = d.tables || {};
  const n = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v.length]));
  if (!("sent_log" in n)) { console.error("dump has no sent_log table"); process.exit(1); }
  console.log(Object.entries(n).map(([k, v]) => k + "=" + v).join(" "));
' "$DEST/$NAME") || fail "dump did not validate — keeping it for inspection"

log "saved $DEST/$NAME ($(du -h "$DEST/$NAME" | cut -f1)) — $COUNTS"

# Prune oldest, newest KEEP retained.
COUNT=$(find "$DEST" -maxdepth 1 -name 'lightdesk-*.json' | wc -l | tr -d ' ')
if [ "$COUNT" -gt "$KEEP" ]; then
  # Sorted by name, not mtime: the names are ISO timestamps, so this stays
  # correct even when several land inside the same filesystem timestamp tick.
  ls -1 "$DEST"/lightdesk-*.json | sort -r | tail -n +$((KEEP + 1)) | while read -r old; do
    log "pruning $(basename "$old")"
    rm -f "$old"
  done
fi
log "done — $(find "$DEST" -maxdepth 1 -name 'lightdesk-*.json' | wc -l | tr -d ' ') backup(s) kept"
