import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SCHEMA_SQL } from "../src/db/schemaSql";
import { exportAll, importAll } from "../src/lib/dbTransfer";

let dir: string;
let source: Client;
let target: Client;

async function fresh(name: string) {
  const c = createClient({ url: `file:${join(dir, name)}` });
  await c.executeMultiple(SCHEMA_SQL);
  return c;
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-transfer-"));
  source = await fresh("source.db");
  target = await fresh("target.db");
  await source.execute({
    sql: "INSERT INTO sent_log (kind, label, body, meta, created_at) VALUES (?,?,?,?,?)",
    args: ["verse", "John 3:16 (KJV)", "For God so loved…", '{"ms":4}', 1788288361],
  });
  // A row with nulls in the optional columns — the shape most likely to break.
  await source.execute({
    sql: "INSERT INTO sent_log (kind, label, body, meta, created_at) VALUES (?,?,?,?,?)",
    args: ["search", "walk on snakes", null, null, 1788288400],
  });
  await source.execute({
    sql: "INSERT INTO songs (guid, title, author, sections, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
    args: ["vp-1", "Amazing", null, '["verse one"]', "videopsalm", 1788288361, 1788288361],
  });
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("exportAll", () => {
  it("captures every row of every table", async () => {
    const dump = await exportAll(source);
    expect(dump.tables.sent_log).toHaveLength(2);
    expect(dump.tables.songs).toHaveLength(1);
    expect(dump.tables.verse_cache).toEqual([]);
    expect(dump.tables.messages).toEqual([]);
  });

  it("stamps the dump so a restore can be identified later", async () => {
    const dump = await exportAll(source);
    expect(dump.version).toBe(1);
    expect(Date.parse(dump.exportedAt)).not.toBeNaN();
  });

  it("survives a completely empty database", async () => {
    const empty = await fresh("empty.db");
    const dump = await exportAll(empty);
    expect(dump.tables.sent_log).toEqual([]);
  });
});

describe("importAll", () => {
  it("reproduces the source rows exactly, nulls included", async () => {
    await importAll(target, await exportAll(source));
    const rows = await target.execute("SELECT kind, label, body, meta, created_at FROM sent_log ORDER BY id");
    expect(rows.rows.map((r) => ({ ...r }))).toEqual([
      { kind: "verse", label: "John 3:16 (KJV)", body: "For God so loved…", meta: '{"ms":4}', created_at: 1788288361 },
      { kind: "search", label: "walk on snakes", body: null, meta: null, created_at: 1788288400 },
    ]);
  });

  it("preserves primary keys, so the log keeps its identity", async () => {
    await importAll(target, await exportAll(source));
    const ids = await target.execute("SELECT id FROM sent_log ORDER BY id");
    const sourceIds = await source.execute("SELECT id FROM sent_log ORDER BY id");
    expect(ids.rows.map((r) => r.id)).toEqual(sourceIds.rows.map((r) => r.id));
  });

  it("is idempotent — restoring twice does not duplicate rows", async () => {
    const dump = await exportAll(source);
    await importAll(target, dump);
    await importAll(target, dump);
    const n = await target.execute("SELECT count(*) c FROM sent_log");
    expect(n.rows[0].c).toBe(2);
  });

  it("reports what it wrote, so a migration can be checked against the source", async () => {
    const written = await importAll(target, await exportAll(source));
    expect(written).toEqual(
      expect.arrayContaining([
        { table: "sent_log", rows: 2 },
        { table: "songs", rows: 1 },
      ]),
    );
  });

  it("round-trips a full copy back out again unchanged", async () => {
    const first = await exportAll(source);
    await importAll(target, first);
    const second = await exportAll(target);
    expect(second.tables).toEqual(first.tables);
  });
});
