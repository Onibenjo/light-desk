/**
 * Load a backup into a database — also how you migrate the volume to Turso:
 *
 *   node scripts/db-backup.mts --url file:/data/lightdesk.db
 *   TURSO_AUTH_TOKEN=… node scripts/db-restore.mts \
 *     --file backups/lightdesk-….json --url libsql://your-db.turso.io
 *
 * Creates the schema first, so it works against an empty database. Restoring is
 * idempotent (INSERT OR REPLACE on the real keys), but it refuses to write over
 * a target that already holds rows unless you pass --force — an old backup
 * replayed over newer data is the one mistake this script could make for you.
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { SCHEMA_SQL } from "../src/db/schemaSql.ts";
import { importAll, DATA_TABLES, type Dump } from "../src/lib/dbTransfer.ts";

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const file = arg("file");
if (!file) {
  console.error("--file <backup.json> is required");
  process.exit(1);
}
const url = arg("url", process.env.TURSO_DATABASE_URL || "file:./local.db")!;
const force = process.argv.includes("--force");

const dump = JSON.parse(readFileSync(file, "utf8")) as Dump;
if (dump.version !== 1) {
  console.error(`unrecognised backup version ${dump.version}`);
  process.exit(1);
}

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
await client.executeMultiple(SCHEMA_SQL);

const existing: string[] = [];
for (const table of DATA_TABLES) {
  const n = Number((await client.execute(`SELECT count(*) c FROM ${table}`)).rows[0].c);
  if (n > 0) existing.push(`${table} (${n})`);
}
if (existing.length && !force) {
  console.error(`refusing to write over existing rows: ${existing.join(", ")}`);
  console.error("re-run with --force if that is what you meant.");
  process.exit(1);
}

console.log(`restoring ${file} (taken ${dump.exportedAt})\n     into ${url}`);
for (const { table, rows } of await importAll(client, dump)) console.log(`  ${table.padEnd(12)} ${String(rows).padStart(6)}`);

// Read it back rather than trusting the write.
console.log("\nverifying:");
let ok = true;
for (const table of DATA_TABLES) {
  const actual = Number((await client.execute(`SELECT count(*) c FROM ${table}`)).rows[0].c);
  const expected = (dump.tables[table] ?? []).length;
  const good = actual >= expected;
  if (!good) ok = false;
  console.log(`  ${table.padEnd(12)} ${String(actual).padStart(6)} / ${expected} ${good ? "ok" : "MISMATCH"}`);
}
process.exit(ok ? 0 : 1);
