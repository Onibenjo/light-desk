# Multi-branch Lightdesk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let several CLC branches use one Lightdesk deployment. They share the songbook and the engagement library, and each branch keeps its own service orders, log, branch-only messages and branch values.

**Architecture:** A new `branches` table. Each branch-owned row gets a `branch_id` column. The session cookie becomes a signed `{branchId, role, pinVersion}`, issued by unlocking with a branch's PIN. Every route reads the branch from the session, never from the client. Shared messages can contain `{key}` tokens, which are filled from the branch's values on the client when shown and copied.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before touching routes or `proxy.ts`), drizzle-orm + libSQL/Turso, Web Crypto, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-multi-branch-design.md`

## Global Constraints

- No migration files: every schema change goes through `applySchema` in `src/db/schemaSql.ts` and must be idempotent on a brand-new and an existing database.
- `src/lib/auth.ts` and anything `src/proxy.ts` imports must stay free of `next/headers` and of the database client (edge-safe, Web Crypto only).
- The branch always comes from the session. No route accepts a `branchId` from the request body or query.
- Existing Ilorin devices stay unlocked across the deploy (legacy cookie accepted and upgraded).
- Interface copy follows `docs/ui-copy.md`. New term: "branch" (e.g. "CLC Ilorin"). Never "tenant", "org" or "campus".
- Commit messages carry no Claude/Anthropic attribution or `Co-Authored-By` trailer.
- Tests: `npx vitest run <file> --reporter=dot` per task; full `npm test` + `npm run lint` + `npm run build` once at the end.

## Review Focus

1. **A setlist row pointing at a message that became another branch's message** (scope changed after it was added): the row must show as missing, the same as a deleted message, and must never show the other branch's text. Test in Task 4.
2. **Two branches given the same PIN** (or a branch PIN equal to `NETWORK_PIN`): this must be refused with "pin-taken", or a device would land in the wrong branch. Test in Task 2.
3. **A branch's PIN is changed:** devices of that branch are locked out on their next request, and other branches' devices are unaffected. Test in Task 2 (`currentSession` returns null after the `pinVersion` bump).
4. **A shared message uses a token this branch has no value for:** nothing is copied, and the operator is told which key is missing. `{` text that is not a valid key is left alone. Tests in Task 5.
5. **Production with no PINs configured:** it must stay locked, not open (open mode is development-only). Test in Task 2.

---

## File map

| File | Responsibility |
|---|---|
| `src/db/schemaSql.ts` (modify) | `branches` DDL, new columns, per-branch active index, first-branch bootstrap |
| `src/db/schema.ts` (modify) | drizzle definitions matching the above |
| `src/lib/pinHash.ts` (create) | `hashPin`, `cleanPin`, edge-safe |
| `src/lib/auth.ts` (rewrite) | session sign/verify, legacy cookie, open mode, edge-safe |
| `src/db/branches.ts` (create) | branch CRUD and PIN lookup |
| `src/lib/adminGate.ts` (modify) | `currentSession()` (checks `pinVersion`), `isAdmin()` |
| `src/proxy.ts`, `src/app/api/unlock/route.ts` (modify) | use the new session |
| `src/db/setlists.ts`, `src/app/api/setlists/**` (modify) | branch scoping |
| `src/app/api/log/route.ts` (modify) | branch scoping |
| `src/db/messages.ts`, `src/lib/messageEdit.ts`, `src/lib/messageLibrary.ts`, `src/app/api/messages/**` (modify) | shared vs branch-only messages |
| `src/app/api/songs/[id]/route.ts`, `src/app/api/songs/import/route.ts` (modify) | gate through `isAdmin()`, record `edited_by` |
| `src/lib/branchTokens.ts` (create) | `fillTokens`, `cleanTokens` |
| `src/app/useMessageCopy.ts`, `src/app/MessageView.tsx`, `src/app/page.tsx` (modify) | fill tokens, refuse missing |
| `src/app/api/branch/route.ts`, `src/app/branch/page.tsx` (create) | the branch's own settings (tokens) |
| `src/app/api/branches/route.ts`, `src/app/api/branches/[id]/route.ts`, `src/app/branches/page.tsx` (create) | network admin: create branch, reset PINs |
| `src/lib/dbTransfer.ts` (modify) | include `branches` in backup/restore |

---

### Task 1: Schema — branches table, branch columns, bootstrap

**Files:**
- Modify: `src/db/schemaSql.ts`, `src/db/schema.ts`, `src/lib/dbTransfer.ts:3`
- Create: `src/lib/pinHash.ts`
- Test: `tests/schema.test.ts` (extend), `tests/pinHash.test.ts`

**Interfaces:**
- Produces:
  - `hashPin(pin: string): Promise<string>`: SHA-256 hex of `` `lightdesk-pin:${pin}` `` (Web Crypto). It deliberately does not depend on `SESSION_SECRET`, so rotating the secret can't make PINs unusable.
  - `cleanPin(value: unknown): string | null`: trimmed, 4–32 characters, otherwise null.
  - Table `branches(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL COLLATE NOCASE UNIQUE, church_pin_hash TEXT UNIQUE, admin_pin_hash TEXT UNIQUE, pin_version INTEGER NOT NULL DEFAULT 0, tokens TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)`.
  - New columns: `setlists.branch_id INTEGER NOT NULL DEFAULT 1`, `sent_log.branch_id INTEGER NOT NULL DEFAULT 1`, `messages.branch_id INTEGER` (NULL = shared), `songs.edited_by INTEGER`.
  - Index `setlists_one_active_per_branch ON setlists (branch_id) WHERE active = 1` replaces `setlists_one_active` (drop it with `DROP INDEX IF EXISTS`).
  - drizzle: `branches` table export; `branchId` on `setlists`, `sentLog`, `messages`; `editedBy` on `songs`.

- [ ] **Step 1: Write the failing tests**

`tests/pinHash.test.ts`:
```ts
it("hashes the same PIN the same way and different PINs differently", async () => {
  expect(await hashPin("1234")).toBe(await hashPin("1234"));
  expect(await hashPin("1234")).not.toBe(await hashPin("1235"));
  expect(await hashPin("1234")).toMatch(/^[0-9a-f]{64}$/);
});
it("cleanPin trims and bounds length", () => {
  expect(cleanPin(" 2468 ")).toBe("2468");
  expect(cleanPin("123")).toBeNull();
  expect(cleanPin("x".repeat(33))).toBeNull();
  expect(cleanPin(1234)).toBeNull();
});
```

In `tests/schema.test.ts`, use a real temp-file client the way `tests/messages.test.ts` does:
```ts
it("upgrades a pre-branch database: rows become branch 1's, messages shared, branch 1 created from env PINs", async () => {
  // create the OLD shape by hand: setlists without branch_id + old setlists_one_active index,
  // messages without branch_id, one active setlist row, one message row
  process.env.CHURCH_PIN = "1111"; process.env.ADMIN_PIN = "9999"; process.env.FIRST_BRANCH_NAME = "CLC Ilorin";
  await applySchema(client);
  expect((await client.execute("SELECT branch_id FROM setlists")).rows[0].branch_id).toBe(1);
  expect((await client.execute("SELECT branch_id FROM messages")).rows[0].branch_id).toBeNull();
  const b = (await client.execute("SELECT * FROM branches")).rows;
  expect(b).toHaveLength(1);
  expect(b[0]).toMatchObject({ id: 1, name: "CLC Ilorin", church_pin_hash: await hashPin("1111"), admin_pin_hash: await hashPin("9999"), pin_version: 0 });
});
it("allows one active setlist per branch, not per database", async () => {
  await applySchema(client);
  // insert active rows for branch 1 and branch 2 → both succeed
  // insert a second active row for branch 1 → rejects (UNIQUE)
});
it("running applySchema twice changes nothing and creates no second branch", async () => { /* count branches === 1 */ });
it("with no env PINs, branch 1 is created with null PIN hashes", async () => { /* church_pin_hash null */ });
```

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run tests/pinHash.test.ts tests/schema.test.ts --reporter=dot`
Expected: FAIL (module `pinHash` missing; `branches` table missing).

- [ ] **Step 3: Implement**

- `src/lib/pinHash.ts` as specified.
- `SCHEMA_SQL`: add `branches`. Include the new columns in the `CREATE TABLE` bodies, so a fresh database has them. Remove the `setlists_one_active` index line from `SCHEMA_SQL`.
- Extend `ADDED_COLUMNS` with the four columns (type strings exactly as listed above, including `NOT NULL DEFAULT 1`).
- Add `POST_COLUMN_SQL`, run after the column loop: `DROP INDEX IF EXISTS setlists_one_active; CREATE UNIQUE INDEX IF NOT EXISTS setlists_one_active_per_branch ON setlists (branch_id) WHERE active = 1; CREATE INDEX IF NOT EXISTS messages_branch ON messages (branch_id); CREATE INDEX IF NOT EXISTS sent_log_branch_created ON sent_log (branch_id, created_at);`. It has to run after the loop because an old database has no `branch_id` until then.
- `ensureFirstBranch(client)`, last step of `applySchema`: `INSERT OR IGNORE INTO branches (id, name, church_pin_hash, admin_pin_hash, created_at) VALUES (1, ?, ?, ?, ?)` with `FIRST_BRANCH_NAME ?? "CLC Ilorin"` and `hashPin` of the env PINs, or null when an env PIN is unset. `OR IGNORE` on id 1 makes two booting instances safe.
- Update the doc comment on `setlists` in `schema.ts` (one active per branch).
- `DATA_TABLES`: put `"branches"` first.

- [ ] **Step 4: Run them and check they pass**

Run: `npx vitest run tests/pinHash.test.ts tests/schema.test.ts tests/dbTransfer.test.ts tests/setlists.test.ts --reporter=dot`
Expected: PASS (setlists tests still pass, because the default branch is 1).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pinHash.ts src/db/schemaSql.ts src/db/schema.ts src/lib/dbTransfer.ts tests/pinHash.test.ts tests/schema.test.ts
git commit -m "Add branches to the schema, with today's data as branch 1"
```

---

### Task 2: Sessions and branch PINs

**Files:**
- Rewrite: `src/lib/auth.ts`
- Create: `src/db/branches.ts`
- Modify: `src/lib/adminGate.ts`, `src/proxy.ts`, `src/app/api/unlock/route.ts`, `src/app/api/songs/[id]/route.ts:8-16`, `src/app/api/songs/import/route.ts:9,25-26`
- Test: `tests/auth.test.ts`, `tests/branches.test.ts`

**Interfaces:**
- Consumes: `hashPin`, `cleanPin`, the `branches` table (Task 1).
- Produces:
  - `type Role = "church" | "admin"`
  - `interface Session { branchId: number; role: Role; pinVersion: number }`
  - `auth.ts`: `SESSION_COOKIE`, `SESSION_MAX_AGE` (unchanged); `signSession(s: Session): Promise<string>` returns `` `${base64url(JSON {b,r,v})}.${hmacHex(payload)}` `` using `SESSION_SECRET`; `sessionFromToken(token: string | undefined): Promise<{ session: Session; legacy: boolean } | null>`; `isOpenMode(): boolean`.
  - `branches.ts`: `interface Branch { id: number; name: string; pinVersion: number; tokens: Record<string, string> }`; `getBranch(id): Promise<Branch | null>`; `listBranches(): Promise<Branch[]>`; `findBranchByPin(pin: string): Promise<{ branch: Branch; role: Role } | null>`; `createBranch(input: { name: string; churchPin: string; adminPin: string | null }): Promise<Branch | "pin-taken" | "name-taken">`; `updateBranch(id: number, patch: { name?: string; churchPin?: string; adminPin?: string | null }): Promise<Branch | "gone" | "pin-taken" | "name-taken">`; `setBranchTokens(id: number, tokens: Record<string, string>): Promise<Branch | "gone">`.
  - `adminGate.ts`: `currentSession(): Promise<Session | null>` (route handlers only); `isAdmin(): Promise<boolean>`, now built on `currentSession`.

Rules the tests pin:
- `findBranchByPin`: an admin hash match gives `admin`. A church hash match gives `church`, or `admin` when that branch has no admin PIN (today's single-PIN mode). An empty PIN never matches.
- PIN uniqueness: a new church or admin PIN must not equal any other branch's church or admin PIN, nor `process.env.NETWORK_PIN`. Otherwise the result is `"pin-taken"`.
- `updateBranch` increments `pin_version` when, and only when, a PIN changes.
- `sessionFromToken`: in open mode it returns `{ session: { branchId: 1, role: "admin", pinVersion: 0 }, legacy: false }` for any token. A token whose signature doesn't verify gives `null`. A legacy token (64-hex, equal to the old `hmac(`${role}:${envPin}`)`) gives `{ session: { branchId: 1, role, pinVersion: 0 }, legacy: true }`.
- `isOpenMode()` is `NODE_ENV !== "production" && !CHURCH_PIN && !ADMIN_PIN`.
- `currentSession()` returns `null` when the branch is gone or `branch.pinVersion !== session.pinVersion`.

- [ ] **Step 1: Write the failing tests**

`tests/auth.test.ts` (pure; set `process.env` per test, `vi.resetModules()`, restore after):
```ts
it("round-trips a signed session", async () => {
  const s = { branchId: 3, role: "church" as const, pinVersion: 2 };
  expect((await sessionFromToken(await signSession(s)))?.session).toEqual(s);
});
it("rejects a token whose payload was edited", async () => {
  const [, sig] = (await signSession({ branchId: 3, role: "church", pinVersion: 0 })).split(".");
  const forged = `${Buffer.from(JSON.stringify({ b: 4, r: "admin", v: 0 })).toString("base64url")}.${sig}`;
  expect(await sessionFromToken(forged)).toBeNull();
});
it("maps a pre-branch cookie to branch 1 and flags it legacy", async () => { /* CHURCH_PIN=1111; token = old hmac("church:1111") → { branchId:1, role:"church", pinVersion:0 }, legacy:true */ });
it("is open only outside production when no PINs are set", async () => {
  /* NODE_ENV=test, no pins → open session for undefined token; NODE_ENV=production, no pins → sessionFromToken(undefined) is null */
});
```

`tests/branches.test.ts` (temp-file DB like `tests/messages.test.ts`; set `CHURCH_PIN=1111`, `ADMIN_PIN=9999`, `NETWORK_PIN=7777` before `ensureSchema`):
```ts
it("finds branch 1 by its church and admin PINs", async () => {
  expect(await findBranchByPin("1111")).toMatchObject({ branch: { id: 1 }, role: "church" });
  expect(await findBranchByPin("9999")).toMatchObject({ branch: { id: 1 }, role: "admin" });
  expect(await findBranchByPin("0000")).toBeNull();
  expect(await findBranchByPin("")).toBeNull();
});
it("a branch without an admin PIN gets admin from its church PIN", async () => { /* createBranch({name:"CLC Lagos", churchPin:"2222", adminPin:null}) → role "admin" */ });
it("refuses a PIN another branch or the network uses", async () => {
  expect(await createBranch({ name: "CLC Lagos", churchPin: "9999", adminPin: null })).toBe("pin-taken");
  expect(await createBranch({ name: "CLC Lagos", churchPin: "7777", adminPin: null })).toBe("pin-taken");
  expect(await createBranch({ name: "clc ilorin", churchPin: "3333", adminPin: null })).toBe("name-taken");
});
it("changing a PIN bumps pinVersion; renaming does not", async () => { /* updateBranch(1,{name:"X"}) → pinVersion 0; updateBranch(1,{churchPin:"4444"}) → 1 */ });
```

- [ ] **Step 2: Run them and check they fail**

Run: `npx vitest run tests/auth.test.ts tests/branches.test.ts --reporter=dot`
Expected: FAIL (exports missing).

- [ ] **Step 3: Implement**

- `auth.ts` and `branches.ts` per the Interfaces block. Use `crypto.subtle` for the HMAC; compare signatures in constant time over the hex strings. Drop `checkPin` and `roleFromToken`.
- `adminGate.ts`: `currentSession` reads the cookie and calls `sessionFromToken`. In open mode it returns that session directly. Otherwise it calls `getBranch` and checks `pinVersion`.
- `proxy.ts`: `sessionFromToken`. A null result locks as today. When `legacy` is true, `NextResponse.next()` sets the cookie to `signSession(session)` with the same options the unlock route uses. Move those options into an exported `SESSION_COOKIE_OPTIONS` in `auth.ts`.
- `unlock/route.ts`: `cleanPin` → `ensureSchema()` → `findBranchByPin`. Wrong PIN gives 401 "Wrong PIN" as today. Success returns `{ ok, role, branch: branch.name }` and the cookie `signSession({ branchId: branch.id, role, pinVersion: branch.pinVersion })`. Keep the rate limit.
- Song routes: replace the local `admin()` / `roleFromToken` checks with `isAdmin()`.

- [ ] **Step 4: Run them and check they pass**

Run: `npx vitest run tests/auth.test.ts tests/branches.test.ts --reporter=dot`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/db/branches.ts src/lib/adminGate.ts src/proxy.ts src/app/api/unlock/route.ts src/app/api/songs tests/auth.test.ts tests/branches.test.ts
git commit -m "Unlock into a branch: each branch has its own PINs"
```

---

### Task 3: Service orders and the log per branch

**Files:**
- Modify: `src/db/setlists.ts`, `src/app/api/setlists/route.ts`, `src/app/api/setlists/[id]/route.ts`, `src/app/api/log/route.ts`
- Test: `tests/setlists.test.ts` (update calls, add cases)

**Interfaces:**
- Consumes: `currentSession()` (Task 2), `setlists.branchId`, `sentLog.branchId` (Task 1).
- Produces: `loadSetlists(branchId: number)`, `findSetlist(branchId: number, id: number)`, `createSetlist(branchId: number, name: string)`, `updateSetlist(branchId: number, id: number, patch: SetlistPatch)`, `deleteSetlist(branchId: number, id: number)`, with return types unchanged. A row of another branch behaves exactly like a missing row.

- [ ] **Step 1: Write the failing tests** (in `tests/setlists.test.ts`; update the existing calls to pass branch `1`)

```ts
it("each branch has its own active service order", async () => {
  const a = await createSetlist(1, "Sunday"); const b = await createSetlist(2, "Sunday");
  await updateSetlist(1, a.id, { active: true }); await updateSetlist(2, b.id, { active: true });
  expect((await findSetlist(1, a.id))?.active).toBe(true);
  expect((await findSetlist(2, b.id))?.active).toBe(true);
});
it("a branch cannot see, change or delete another branch's service order", async () => {
  const a = await createSetlist(1, "Sunday");
  expect(await loadSetlists(2)).toEqual([]);
  expect(await findSetlist(2, a.id)).toBeNull();
  expect(await updateSetlist(2, a.id, { name: "x" })).toBe("gone");
  expect(await deleteSetlist(2, a.id)).toBe(false);
});
```

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run tests/setlists.test.ts --reporter=dot` → FAIL.

- [ ] **Step 3: Implement**

Add `eq(setlists.branchId, branchId)` to every read, write and delete. The "clear the old active row" statement clears only this branch's rows. Routes: `const session = await currentSession(); if (!session) return 401 { error: "locked" }`, then pass `session.branchId`. Log route: `POST` inserts `branchId: session.branchId`; `GET` (both the days scan and the rows query) adds `eq(sentLog.branchId, session.branchId)`.

- [ ] **Step 4: Run and check they pass**

Run: `npx vitest run tests/setlists.test.ts tests/setlistRoute.test.ts tests/logQuery.test.ts --reporter=dot` → PASS. (If `setlistRoute.test.ts` mocks `@/db/setlists`, update the mocked signatures.)

- [ ] **Step 5: Commit**

```bash
git add src/db/setlists.ts src/app/api/setlists src/app/api/log/route.ts tests/setlists.test.ts tests/setlistRoute.test.ts
git commit -m "Keep service orders and the log to their own branch"
```

---

### Task 4: Shared and branch-only messages; who edited a song

**Files:**
- Modify: `src/db/messages.ts`, `src/lib/messageEdit.ts`, `src/lib/messageLibrary.ts`, `src/app/api/messages/route.ts`, `src/app/api/messages/[id]/route.ts`, `src/app/api/setlists/[id]/route.ts:39`, `src/app/api/songs/[id]/route.ts:56`
- Test: `tests/messages.test.ts`, `tests/messageEdit.test.ts`

**Interfaces:**
- Consumes: `currentSession()`, `getBranch()` (Task 2).
- Produces:
  - `type MessageScope = "shared" | "branch"`
  - `LibraryMessage` gains `shared: boolean`.
  - `Library` gains `branch: { id: number; name: string; tokens: Record<string, string> }`.
  - `MessageCreate` gains `scope: MessageScope`, defaulting to `"shared"` when absent. `MessagePatch` gains optional `scope`.
  - `loadLibrary(branch: Branch): Promise<Library>`: all sections, plus messages where `branch_id IS NULL OR branch_id = branch.id`.
  - `createMessage(branchId: number, input: MessageCreate)`: stores `branch_id = scope === "branch" ? branchId : null`.
  - `updateMessage(branchId: number, id: number, patch: MessagePatch)` and `deleteMessage(branchId: number, id: number)`: another branch's message is `"gone"` / `false`. `scope` moves the message between shared and this branch.
  - `factsForMessages(branchId: number, ids: number[])`: only visible messages are returned.
  - `seedLibrary` is unchanged (seeds shared messages).

- [ ] **Step 1: Write the failing tests** (`tests/messages.test.ts`; existing calls pass branch `1`, and `loadLibrary` takes `{ id: 1, name: "CLC Ilorin", pinVersion: 0, tokens: {} }`)

```ts
it("a branch sees shared messages and its own, not another branch's", async () => {
  const s = await section("Prayer Before Sermon");
  await lib.createMessage(1, { sectionId: s.id, title: "Shared", parts: ["x"], scope: "shared" });
  await lib.createMessage(1, { sectionId: s.id, title: "Ilorin pastor", parts: ["x"], scope: "branch" });
  await lib.createMessage(2, { sectionId: s.id, title: "Lagos pastor", parts: ["x"], scope: "branch" });
  const titles = (await lib.loadLibrary(branch(1))).messages.map((m) => m.title);
  expect(titles).toEqual(["Shared", "Ilorin pastor"]);
});
it("another branch's message is gone to this branch", async () => { /* update/delete from branch 2 → "gone"/false; factsForMessages(2,[id]) has no entry */ });
it("moving a message to branch-only hides it from setlist checks in other branches", async () => {
  /* shared message m; updateMessage(1, m.id, { scope: "branch" }); factsForMessages(2, [m.id]).has(m.id) === false */
});
it("any branch can edit a shared message, and every branch sees the edit", async () => { /* updateMessage(2, shared.id, {title:"New"}); loadLibrary(branch(1)) shows "New" */ });
```
`tests/messageEdit.test.ts`: `parseMessageCreate({ sectionId: 1, title: "t", text: "x" })` has `scope: "shared"`; `scope: "branch"` passes through; `scope: "everyone"` returns an error string.

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run tests/messages.test.ts tests/messageEdit.test.ts --reporter=dot` → FAIL.

- [ ] **Step 3: Implement**

Use a visibility predicate in `messages.ts`: `or(isNull(messages.branchId), eq(messages.branchId, branchId))`. `findMessageRow` takes `branchId` and applies it. Routes get the session (401 when it's missing) and pass `session.branchId`. `GET /api/messages` calls `getBranch(session.branchId)` and returns `loadLibrary(branch)`. Song `PATCH` sets `editedBy: session.branchId` next to `editedAt`. Then update `isLibrary` in `src/app/useMessages.ts` and the other test fixtures (`tests/fixtures/library.ts`) to the new `Library` shape.

- [ ] **Step 4: Run and check they pass**

Run: `npx vitest run tests/messages.test.ts tests/messageEdit.test.ts tests/messageLibrary.test.ts tests/messageList.test.tsx tests/setlistRoute.test.ts --reporter=dot` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/messages.ts src/lib/messageEdit.ts src/lib/messageLibrary.ts src/app/api/messages src/app/api/setlists src/app/api/songs src/app/useMessages.ts tests
git commit -m "Let a branch keep its own engagement messages beside the shared ones"
```

---

### Task 5: Branch tokens in messages

**Files:**
- Create: `src/lib/branchTokens.ts`
- Modify: `src/app/useMessageCopy.ts`, `src/app/MessageView.tsx`, `src/app/MessagesTab.tsx:226`, `src/app/page.tsx:316-317`
- Test: `tests/branchTokens.test.ts`, `tests/messageView.test.tsx`

**Interfaces:**
- Consumes: `Library.branch.tokens` (Task 4).
- Produces:
  - `TOKEN_PATTERN = /\{([a-z][a-zA-Z0-9]{0,39})\}/g`
  - `fillTokens(text: string, tokens: Record<string, string>): { text: string; missing: string[] }`: replaces each `{key}` that has a value. Keys without a value stay in the text verbatim and are listed in `missing` once each, in order of first appearance.
  - `cleanTokens(raw: unknown): Record<string, string> | string`: an object of at most 50 entries; keys match `^[a-z][a-zA-Z0-9]{0,39}$`; values are trimmed non-empty strings of at most 4000 chars. Anything else returns an error string naming the bad key.
  - `useMessageCopy` deps gain `tokens: Record<string, string>`.
  - `MessageView` gains a `tokens: Record<string, string>` prop.

- [ ] **Step 1: Write the failing tests**

`tests/branchTokens.test.ts`:
```ts
it("fills known keys and reports missing ones", () => {
  expect(fillTokens("Email {testimonyEmail}. Accounts: {offeringAccounts}", { testimonyEmail: "a@b.c" }))
    .toEqual({ text: "Email a@b.c. Accounts: {offeringAccounts}", missing: ["offeringAccounts"] });
});
it("leaves braces that are not keys, and [DATE], alone", () => {
  expect(fillTokens("{ not a key } {Upper} [DATE]", {})).toEqual({ text: "{ not a key } {Upper} [DATE]", missing: [] });
});
it("lists a missing key once", () => { expect(fillTokens("{a} {a}", {}).missing).toEqual(["a"]); });
it("cleanTokens validates keys and values", () => {
  expect(cleanTokens({ midweekTime: " 5:30pm " })).toEqual({ midweekTime: "5:30pm" });
  expect(cleanTokens({ "bad key": "x" })).toMatch(/bad key/);
  expect(cleanTokens({ a: "" })).toMatch(/a/);
});
```
`tests/messageView.test.tsx`: render with `parts={["Give via {offeringAccounts}"]}` and `tokens={{ offeringAccounts: "Zenith 123" }}`, then assert "Give via Zenith 123" is shown. With `tokens={{}}`, assert the text "No value for {offeringAccounts} in this branch" is shown.

- [ ] **Step 2: Run and check they fail**

Run: `npx vitest run tests/branchTokens.test.ts tests/messageView.test.tsx --reporter=dot` → FAIL.

- [ ] **Step 3: Implement**

- `copyPart` runs `fillTokens` on the part. If `missing` is non-empty it copies nothing, logs nothing, and shows the toast `` `No value for {${missing[0]}} in this branch — set it in Branch settings` `` with tone `"err"`, then returns false. Otherwise it copies and logs the filled text.
- `MessageView` renders each part filled. A part with missing keys shows the line above beneath it, in the existing warning style.
- `page.tsx` passes `library?.branch.tokens ?? {}` to `useMessageCopy` and on down to `MessagesTab` → `MessageView`.

- [ ] **Step 4: Run and check they pass**

Run: `npx vitest run tests/branchTokens.test.ts tests/messageView.test.tsx --reporter=dot` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/branchTokens.ts src/app/useMessageCopy.ts src/app/MessageView.tsx src/app/MessagesTab.tsx src/app/page.tsx tests/branchTokens.test.ts tests/messageView.test.tsx
git commit -m "Fill a branch's own details into shared messages"
```

---

### Task 6: Branch settings, network admin, scope in the library editor

**Files:**
- Create: `src/app/api/branch/route.ts`, `src/app/branch/page.tsx`, `src/app/api/branches/route.ts`, `src/app/api/branches/[id]/route.ts`, `src/app/branches/page.tsx`
- Modify: `src/app/messages/page.tsx` (editor + rows), `src/proxy.ts` (let `/branches` and `/api/branches` past the lock, like `/unlock`), the desk header (`src/app/OpenHeader.tsx` or `PageShell.tsx`, whichever renders the title)
- Test: `tests/networkGate.test.ts`

**Interfaces:**
- Consumes: `currentSession`, `isAdmin`, `getBranch`, `listBranches`, `createBranch`, `updateBranch`, `setBranchTokens` (Task 2), `cleanTokens` (Task 5), `cleanPin` (Task 1).
- Produces:
  - `GET /api/branch` (any session) returns `{ id, name, tokens }`. `PUT /api/branch` (admin) takes body `{ tokens }`, validates it with `cleanTokens`, and returns `{ ok, branch }`. Without admin it returns 403 "Changing branch settings needs the admin PIN".
  - `networkPinOk(req: Request): boolean` in `src/lib/networkGate.ts`: true only when `NETWORK_PIN` is set and equals the `x-network-pin` header. Rate-limited with the same `rateLimit` as unlock (key `network:${clientKey(req)}`).
  - `GET /api/branches` returns `{ branches: { id, name }[] }`. `POST /api/branches` takes `{ name, churchPin, adminPin? }`. `PATCH /api/branches/:id` takes `{ name?, churchPin?, adminPin? }`. All three are gated by `networkPinOk` (401 "Wrong network PIN"). `"pin-taken"` → 409 "That PIN is already used by a branch". `"name-taken"` → 409 "There is already a branch with that name".

- [ ] **Step 1: Write the failing test**

`tests/networkGate.test.ts`:
```ts
it("refuses when NETWORK_PIN is unset, even with an empty header", () => { delete process.env.NETWORK_PIN; expect(networkPinOk(req({ "x-network-pin": "" }))).toBe(false); });
it("accepts only the exact PIN", () => { process.env.NETWORK_PIN = "7777"; expect(networkPinOk(req({ "x-network-pin": "7777" }))).toBe(true); expect(networkPinOk(req({ "x-network-pin": "777" }))).toBe(false); });
```

- [ ] **Step 2: Run and check it fails**

Run: `npx vitest run tests/networkGate.test.ts --reporter=dot` → FAIL.

- [ ] **Step 3: Implement the routes and gate**

As specified in Interfaces. Every route calls `ensureSchema()` first, as the existing routes do.

- [ ] **Step 4: Implement the pages**

- `/branch`: the branch name as the heading, then one row per token (key, a textarea for the value, Remove) and an Add row. Saving does a `PUT`. A 403 shows the existing "unlock the admin PIN in a new tab" hint, which is reused from `messages/page.tsx`. Under the heading, list the keys used anywhere in the library that this branch has no value for: scan `library.messages` with `TOKEN_PATTERN`.
- `/branches`: a network PIN field kept in component state only, never stored. Below it, the branch list, a create form (name, church PIN, optional admin PIN), and per branch "Change PINs" and rename. Explain once: changing a PIN locks that branch's devices until they unlock again.
- `messages/page.tsx` editor: a two-option control, "All branches" or "`<branch name>` only" (sends `scope`). Branch-only rows get a small "`<branch name>` only" badge. Copy follows `docs/ui-copy.md`.
- The desk header shows `library.branch.name` quietly next to the title.
- Link `/branch` from the library page header for admins.

- [ ] **Step 5: Verify in the app**

Run `npm run dev` with `CHURCH_PIN=1111 ADMIN_PIN=9999 NETWORK_PIN=7777`. Use `/branches` to create "CLC Lagos" (church 2222, admin 8888). In one browser profile unlock with 9999, in another with 8888. Check that:
- each profile shows its own branch name;
- a service order made in Ilorin doesn't appear in Lagos;
- a branch-only message created in Lagos doesn't appear in Ilorin;
- a shared message with `{midweekTime}` copies "5:30pm" in Ilorin after setting it in `/branch`, and is refused with the missing-key toast in Lagos;
- changing Lagos's church PIN in `/branches` sends the Lagos profile to `/unlock` on its next request, while Ilorin stays in.

- [ ] **Step 6: Run the tests, lint and build**

Run: `npx vitest run tests/networkGate.test.ts --reporter=dot && npm run lint && npm run build 2>&1 | tail -20` → PASS / no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/networkGate.ts src/app/api/branch src/app/api/branches src/app/branch src/app/branches src/app/messages/page.tsx src/proxy.ts src/app/OpenHeader.tsx src/app/PageShell.tsx tests/networkGate.test.ts
git commit -m "Branch settings, a page to add branches, and branch-only messages in the library"
```

---

### Task 7: Docs, full verification

**Files:**
- Modify: `README.md` (env section), `PRODUCT.md` (Users, Positioning, Access), `docs/ui-copy.md` (glossary: "branch", "Branch settings", "All branches / `<name>` only")

- [ ] **Step 1: Document**

- README: `NETWORK_PIN` (manages branches; keep it off church devices). `FIRST_BRANCH_NAME` (default "CLC Ilorin"; only read when the database has no branch). `CHURCH_PIN`/`ADMIN_PIN` now only seed branch 1 on first boot; after that, PINs are changed in `/branches`. A production deploy with no PINs stays locked.
- PRODUCT.md: replace "a single-church tool" with a multi-branch line that keeps the CLC-only stance.

- [ ] **Step 2: Run the full suite**

Run: `npm test 2>&1 | tail -15 && npm run lint && npm run build 2>&1 | tail -10`
Expected: all tests pass, no lint errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add README.md PRODUCT.md docs/ui-copy.md
git commit -m "Document branches"
```

---

## After deploy: content work before a second branch joins (manual, by an Ilorin admin)

Every message starts out shared, so nothing changes for Ilorin on deploy. Before giving another branch its PINs:

1. **Make Ilorin-only:** the pastor variants in Prayer Before Ambience Jewel, Prayer Before Sermon and Welcoming Pastor (except Apostle Muyiwa Areo and Pastor Temitope Areo, who stay shared), plus any local Special Programs.
2. **Turn into tokens** in `/branch` for Ilorin, then edit the shared messages to use them:
   - `{testimonyEmail}` for `clcilorintestimony@gmail.com` (Testimony)
   - `{offeringAccounts}`, `{titheAccounts}`, `{welfareAccount}`, `{outreachAccount}` (Offerings and Tithe). Confirm which accounts are network-wide (MAMI Partnership, Honour and Nations Seed are likely shared) and leave those literal.
   - `{midweekTime}` ("5:30pm"), `{sundayFirstTime}` ("8am"), `{sundaySecondTime}` ("10am") in Next Service
3. Open `/branch` as the new branch's admin: the "keys with no value" list shows exactly what they need to fill in.
