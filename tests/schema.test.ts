import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySchema } from "../src/db/schemaSql";
import { hashPin } from "../src/lib/pinHash";

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
    expect(cols).toEqual(["id", "name", "items", "active", "created_at", "updated_at", "branch_id"]);
  });

  it("refuses a second active setlist in the same branch, so one-active is the database's rule and not the caller's", async () => {
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

describe("the message library tables", () => {
  const placeholder = `CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, section TEXT NOT NULL, title TEXT NOT NULL,
    body TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
  );`;
  const cols = async (table: string) => (await client.execute(`PRAGMA table_info(${table})`)).rows.map((r) => columnName(r.name));

  it("creates both tables with every column", async () => {
    await applySchema(client);
    expect(await cols("message_sections")).toEqual(["id", "name", "sort", "in_service"]);
    expect(await cols("messages")).toEqual(["id", "section_id", "title", "parts", "sort", "created_at", "updated_at", "branch_id"]);
  });

  it("replaces the empty placeholder table the first release created", async () => {
    await client.executeMultiple(placeholder);
    await applySchema(client);
    expect(await cols("messages")).toContain("parts");
    expect(await cols("messages")).not.toContain("body");
  });

  it("refuses to drop a placeholder table that has rows, and leaves them where they are", async () => {
    await client.executeMultiple(placeholder);
    await client.execute({ sql: "INSERT INTO messages (section, title, body) VALUES (?,?,?)", args: ["Apologies", "Sound", "Sorry"] });
    await expect(applySchema(client)).rejects.toThrow(/messages/);
    expect((await client.execute("SELECT body FROM messages")).rows[0].body).toBe("Sorry");
  });

  it("leaves a real library alone on the next boot", async () => {
    await applySchema(client);
    await client.execute({ sql: "INSERT INTO message_sections (name, sort) VALUES (?,?)", args: ["Apologies", 0] });
    await client.execute({
      sql: "INSERT INTO messages (section_id, title, parts, sort, created_at, updated_at) VALUES (?,?,?,?,?,?)",
      args: [1, "Sound restored", '["Sorry"]', 0, 1, 1],
    });
    await applySchema(client);
    expect((await client.execute("SELECT count(*) AS n FROM messages")).rows[0].n).toBe(1);
  });

  it("treats section names that differ only in case as the same name", async () => {
    await applySchema(client);
    await client.execute({ sql: "INSERT INTO message_sections (name, sort) VALUES (?,?)", args: ["Apologies", 0] });
    await expect(client.execute({ sql: "INSERT INTO message_sections (name, sort) VALUES (?,?)", args: ["apologies", 1] })).rejects.toThrow(/UNIQUE/i);
  });
});

describe("branches", () => {
  const ENV = ["CHURCH_PIN", "ADMIN_PIN", "FIRST_BRANCH_NAME"] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; }
  });
  afterEach(() => {
    for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
  const insertActive = (branch: number) =>
    client.execute({
      sql: "INSERT INTO setlists (name, items, active, created_at, updated_at, branch_id) VALUES (?,?,?,?,?,?)",
      args: ["S", "[]", 1, 1, 1, branch],
    });

  it("upgrades a pre-branch database: rows become branch 1's, messages shared, branch 1 created from env PINs", async () => {
    await client.executeMultiple(`
      CREATE TABLE setlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, items TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX setlists_one_active ON setlists (active) WHERE active = 1;
      CREATE TABLE message_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        sort INTEGER NOT NULL, in_service INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, section_id INTEGER NOT NULL REFERENCES message_sections(id),
        title TEXT NOT NULL, parts TEXT NOT NULL, sort INTEGER NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE TABLE sent_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, label TEXT NOT NULL,
        body TEXT, meta TEXT, created_at INTEGER NOT NULL
      );
      INSERT INTO setlists (name, items, active, created_at, updated_at) VALUES ('Sunday', '[]', 1, 1, 1);
      INSERT INTO message_sections (name, sort) VALUES ('Apologies', 0);
      INSERT INTO messages (section_id, title, parts, sort, created_at, updated_at) VALUES (1, 'Sorry', '[]', 0, 1, 1);
      INSERT INTO sent_log (kind, label, created_at) VALUES ('verse', 'x', 1);
    `);
    process.env.CHURCH_PIN = "1111";
    process.env.ADMIN_PIN = "9999";
    process.env.FIRST_BRANCH_NAME = "CLC Ilorin";
    await applySchema(client);
    expect((await client.execute("SELECT branch_id FROM setlists")).rows[0].branch_id).toBe(1);
    expect((await client.execute("SELECT branch_id FROM sent_log")).rows[0].branch_id).toBe(1);
    expect((await client.execute("SELECT branch_id FROM messages")).rows[0].branch_id).toBeNull();
    const b = (await client.execute("SELECT * FROM branches")).rows;
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ id: 1, name: "CLC Ilorin", church_pin_hash: await hashPin("1111"), admin_pin_hash: await hashPin("9999"), pin_version: 0 });
    expect(b[0].tokens).toBe("{}");
  });

  it("seeds branch 1 from env PINs trimmed, and skips ones blank after trimming", async () => {
    process.env.CHURCH_PIN = " 123 ";
    process.env.ADMIN_PIN = "   ";
    await applySchema(client);
    const b = (await client.execute("SELECT * FROM branches")).rows[0];
    expect(b.church_pin_hash).toBe(await hashPin("123"));
    expect(b.admin_pin_hash).toBeNull();
  });

  it("adds songs.edited_by", async () => {
    await applySchema(client);
    expect(await columns()).toContain("edited_by");
  });

  it("allows one active setlist per branch, not per database", async () => {
    await applySchema(client);
    await client.execute({ sql: "INSERT INTO branches (id, name, created_at) VALUES (2, 'Other', 1)", args: [] });
    await insertActive(1);
    await insertActive(2);
    await expect(insertActive(1)).rejects.toThrow(/UNIQUE/i);
  });

  it("running applySchema twice changes nothing and creates no second branch", async () => {
    await applySchema(client);
    await applySchema(client);
    expect((await client.execute("SELECT count(*) AS n FROM branches")).rows[0].n).toBe(1);
  });

  it("two instances booting at once still leave one branch", async () => {
    const other = createClient({ url: `file:${join(dir, "test.db")}` });
    try {
      const results = await Promise.allSettled([applySchema(client), applySchema(other)]);
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      expect((await client.execute("SELECT count(*) AS n FROM branches")).rows[0].n).toBe(1);
    } finally {
      other.close();
    }
  });

  it("with no env PINs, branch 1 is created with null PIN hashes", async () => {
    await applySchema(client);
    const b = (await client.execute("SELECT * FROM branches")).rows[0];
    expect(b.name).toBe("CLC Ilorin");
    expect(b.church_pin_hash).toBeNull();
    expect(b.admin_pin_hash).toBeNull();
  });
});
