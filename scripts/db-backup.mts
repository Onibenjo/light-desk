/**
 * Dump the whole database to a JSON file.
 *
 *   node scripts/db-backup.mts                          # whatever .env points at
 *   node scripts/db-backup.mts --url file:/data/lightdesk.db
 *   node scripts/db-backup.mts --out ./backups
 *
 * Run it on the Coolify host against the mounted volume to get a copy off the
 * box, and run it against Turso to guard against a bad import — replication
 * protects you from a dead server, not from deleting the wrong thing.
 */
import { createClient } from "@libsql/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportAll } from "../src/lib/dbTransfer.ts";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const url = arg("url", process.env.TURSO_DATABASE_URL || "file:./local.db")!;
const outDir = arg("out", "./backups")!;

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
const dump = await exportAll(client);

mkdirSync(outDir, { recursive: true });
const stamp = dump.exportedAt.replace(/[:.]/g, "-");
const file = join(outDir, `lightdesk-${stamp}.json`);
writeFileSync(file, JSON.stringify(dump, null, 2));

console.log(`source ${url}`);
for (const [table, rows] of Object.entries(dump.tables)) console.log(`  ${table.padEnd(12)} ${String(rows.length).padStart(6)}`);
console.log(`\nwrote ${file}`);
