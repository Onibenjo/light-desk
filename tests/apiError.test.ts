import { describe, it, expect } from "vitest";
import { describeFailure, failureFrom, OFFLINE, unlockHref } from "../src/lib/apiError";

describe("describeFailure", () => {
  it("turns an expired or changed PIN into an instruction, not the raw 'locked'", () => {
    const f = describeFailure(401, "locked");
    expect(f.kind).toBe("locked");
    expect(f.message).not.toMatch(/^locked$/i);
    expect(f.message).toMatch(/PIN/);
  });

  it("keeps the server's own words for a refusal the operator can act on", () => {
    expect(describeFailure(403, "Admin PIN required to import")).toEqual({ kind: "denied", message: "Admin PIN required to import" });
    expect(describeFailure(429, "Slow down — too many searches.")).toEqual({ kind: "limited", message: "Slow down — too many searches." });
    expect(describeFailure(409, "Someone else changed this setlist")).toEqual({ kind: "conflict", message: "Someone else changed this setlist" });
    expect(describeFailure(400, "A setlist needs a name of 1 to 80 characters")).toEqual({ kind: "refused", message: "A setlist needs a name of 1 to 80 characters" });
    expect(describeFailure(502, "Every Bible source failed")).toEqual({ kind: "server", message: "Every Bible source failed" });
  });

  it("falls back to plain words when the server gave none", () => {
    expect(describeFailure(403).message).toMatch(/admin PIN/i);
    expect(describeFailure(429).message).toMatch(/wait/i);
    expect(describeFailure(500).kind).toBe("server");
    expect(describeFailure(500).message).toMatch(/try again/i);
    expect(describeFailure(404, undefined, "That song is gone")).toEqual({ kind: "refused", message: "That song is gone" });
  });

  it("ignores an error field that is not a usable sentence", () => {
    expect(describeFailure(500, "").message).toMatch(/try again/i);
    expect(describeFailure(500, "   ").message).toMatch(/try again/i);
    expect(describeFailure(400, { nested: true } as unknown as string, "Could not save").message).toBe("Could not save");
  });
});

describe("failureFrom", () => {
  it("reads the error from a JSON body", async () => {
    const res = new Response(JSON.stringify({ error: "No such setlist" }), { status: 404 });
    expect(await failureFrom(res, "Could not load")).toEqual({ kind: "refused", message: "No such setlist" });
  });

  it("survives a body that is not JSON, like a proxy's HTML error page", async () => {
    const res = new Response("<html>Bad gateway</html>", { status: 502 });
    const f = await failureFrom(res, "Lookup failed");
    expect(f.kind).toBe("server");
    expect(f.message).not.toMatch(/html/i);
  });

  it("recognises the PIN gate's 401 from its body", async () => {
    const res = new Response(JSON.stringify({ error: "locked" }), { status: 401 });
    expect((await failureFrom(res, "Could not load")).kind).toBe("locked");
  });
});

describe("OFFLINE and unlockHref", () => {
  it("names the network, not the app, when fetch itself threw", () => {
    expect(OFFLINE.kind).toBe("offline");
    expect(OFFLINE.message).toMatch(/connection|wifi/i);
  });

  it("sends the operator back where they were after unlocking", () => {
    expect(unlockHref("/setlists")).toBe("/unlock?next=%2Fsetlists");
    expect(unlockHref("/")).toBe("/unlock?next=%2F");
  });
});
