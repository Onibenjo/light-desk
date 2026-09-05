import type { Client } from "@libsql/client";
/** Every table carrying data, in an order that is safe to restore sequentially. */
export const DATA_TABLES = ["verse_cache", "sent_log", "songs", "messages"] as const;

type Row = Record<string, unknown>;

export type Dump = {
  version: 1;
  exportedAt: string;
  tables: Record<string, Row[]>;
};

/** Everything in the database, as plain JSON. 1.9MB of SQLite fits comfortably. */
export async function exportAll(client: Client): Promise<Dump> {
  const tables: Record<string, Row[]> = {};
  for (const table of DATA_TABLES) {
    // Ordered by rowid so successive dumps of an unchanged database are identical.
    const res = await client.execute(`SELECT * FROM ${table} ORDER BY rowid`);
    tables[table] = res.rows.map((r) => ({ ...r }) as Row);
  }
  return { version: 1, exportedAt: new Date().toISOString(), tables };
}

/**
 * Write a dump into a database that already has the schema. Uses INSERT OR
 * REPLACE keyed on the real primary keys, so re-running a restore is safe —
 * you can re-point it at the same target without doubling every row.
 */
export async function importAll(client: Client, dump: Dump): Promise<{ table: string; rows: number }[]> {
  const written: { table: string; rows: number }[] = [];
  for (const table of DATA_TABLES) {
    const rows = dump.tables[table] ?? [];
    if (rows.length) {
      const cols = Object.keys(rows[0]);
      const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      // One batch per table: a partial restore is worse than a failed one.
      await client.batch(
        rows.map((row) => ({ sql, args: cols.map((c) => row[c] as never) })),
        "write",
      );
    }
    written.push({ table, rows: rows.length });
  }
  return written;
}
