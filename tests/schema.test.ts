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

  it("tolerates a concurrent ALTER that lost the race, the way two instances cold-starting at once would", async () => {
    // Same file, two separate connections — the shape a Turso client per
    // container instance actually takes, not a single process racing itself.
    const other = createClient({ url: `file:${join(dir, "test.db")}` });
    try {
      const results = await Promise.allSettled([applySchema(client), applySchema(other)]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      expect((await columns()).filter((c) => c === "edited_at").length).toBe(1);
    } finally {
      other.close();
    }
  });
});

describe("the setlists table", () => {
  const insertActive = (name: string, active: number) =>
    client.execute({
      sql: "INSERT INTO setlists (name, items, active, created_at, updated_at) VALUES (?,?,?,?,?)",
      args: [name, "[]", active, 1, 1],
    });

  it("is created with every column", async () => {
    await applySchema(client);
    const cols = (await client.execute("PRAGMA table_info(setlists)")).rows.map((r) => columnName(r.name));
    expect(cols).toEqual(["id", "name", "items", "active", "created_at", "updated_at"]);
  });

  it("refuses a second active setlist, so one-active is the database's rule and not the caller's", async () => {
    await applySchema(client);
    await insertActive("Sunday 1st service", 1);
    await expect(insertActive("Sunday 2nd service", 1)).rejects.toThrow(/UNIQUE/i);
  });

  it("allows any number of setlists that are not active", async () => {
    await applySchema(client);
    await insertActive("Last Sunday", 0);
    await insertActive("The Sunday before", 0);
    await insertActive("Rehearsal", 0);
    expect((await client.execute("SELECT count(*) AS n FROM setlists")).rows[0].n).toBe(3);
  });

  it("appears in a database made before setlists existed", async () => {
    await client.executeMultiple(`CREATE TABLE songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, guid TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      author TEXT, sections TEXT NOT NULL, source TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );`);
    await applySchema(client);
    await insertActive("Sunday", 1);
    expect((await client.execute("SELECT name FROM setlists")).rows[0].name).toBe("Sunday");
  });
});
