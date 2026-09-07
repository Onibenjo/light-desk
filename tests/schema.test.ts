import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySchema } from "../src/db/schemaSql";

let dir: string;
let client: Client;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-schema-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
});
afterEach(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

/** PRAGMA table_info's `name` column is untyped SqlValue; verify it's the string it always is rather than asserting it. */
function columnName(value: unknown): string {
  if (typeof value !== "string") throw new Error(`expected a column name, got ${typeof value}: ${String(value)}`);
  return value;
}

const columns = async () => (await client.execute("PRAGMA table_info(songs)")).rows.map((r) => columnName(r.name));

describe("bringing a database up to date", () => {
  it("creates the songs table with every column", async () => {
    await applySchema(client);
    expect(await columns()).toContain("edited_at");
  });

  it("adds the column to a database made before it existed", async () => {
    await client.executeMultiple(`CREATE TABLE songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      author TEXT, sections TEXT NOT NULL, source TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );`);
    await client.execute({ sql: "INSERT INTO songs (guid,title,sections,source,created_at,updated_at) VALUES (?,?,?,?,?,?)", args: ["g", "Abide With Me", "[]", "videopsalm", 1, 1] });

    await applySchema(client);

    expect(await columns()).toContain("edited_at");
    const rows = (await client.execute("SELECT title, edited_at FROM songs")).rows;
    expect(rows[0].title).toBe("Abide With Me");
    expect(rows[0].edited_at).toBe(null);
  });

  it("is safe to run twice", async () => {
    await applySchema(client);
    await applySchema(client);
    expect((await columns()).filter((c) => c === "edited_at").length).toBe(1);
  });
});
