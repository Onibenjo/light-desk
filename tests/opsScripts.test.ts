import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

// The backup and restore scripts run under plain Node inside the Docker image,
// next to only the source files the Dockerfile copies for them. This rebuilds
// that layout and runs both scripts, so a missing COPY line or an import
// without its .ts extension fails here rather than on the server.

const ROOT = resolve(__dirname, "..");
let dir: string;

/** The `/app/src/...` files the Dockerfile's runtime stage copies in. */
function imageSourceFiles(): string[] {
  const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8");
  return [...dockerfile.matchAll(/^COPY --from=builder \S+ \/app\/(src\/\S+) /gm)].map((m) => m[1]);
}

function run(script: string, args: string[]): string {
  return execFileSync(process.execPath, [join(dir, "scripts", script), ...args], { cwd: dir, encoding: "utf8", stdio: "pipe", env: { ...process.env, TURSO_DATABASE_URL: "" } });
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "lightdesk-ops-"));
  cpSync(join(ROOT, "scripts"), join(dir, "scripts"), { recursive: true });
  for (const file of imageSourceFiles()) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    cpSync(join(ROOT, file), join(dir, file));
  }
  symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("backup and restore scripts in the image layout", () => {
  it("copies the schema module and what it imports", () => {
    expect(imageSourceFiles()).toEqual(expect.arrayContaining(["src/db/schemaSql.ts", "src/lib/dbTransfer.ts", "src/lib/pinHash.ts", "src/lib/constantTime.ts"]));
  });

  it("backs up one database and restores it into another", () => {
    const source = `file:${join(dir, "source.db")}`;
    const target = `file:${join(dir, "target.db")}`;
    // Restoring into an empty file creates the schema, so a one-row dump seeds the source.
    const seed = join(dir, "seed.json");
    const row = { id: 1, kind: "verse", label: "John 3:16 (KJV)", body: "For God so loved…", meta: null, created_at: 1788288361, branch_id: 1 };
    writeFileSync(seed, JSON.stringify({ version: 1, exportedAt: "2026-11-09T00:00:00.000Z", tables: { sent_log: [row] } }));
    run("db-restore.mts", ["--file", seed, "--url", source]);
    const out = run("db-backup.mts", ["--url", source, "--out", join(dir, "backups")]);
    expect(out).toContain("wrote");
    expect(() => run("db-restore.mts", ["--file", seed, "--url", source])).toThrow(/refusing to write over existing rows: sent_log \(1\)/);
    const [file] = readdirSync(join(dir, "backups"));
    // The target's own branch 1, created with its schema, doesn't count as data to protect: no --force needed.
    expect(run("db-restore.mts", ["--file", join(dir, "backups", file), "--url", target])).toMatch(/sent_log\s+1 \/ 1 ok/);
  });
});
