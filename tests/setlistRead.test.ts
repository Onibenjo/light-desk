// Reading a setlist with the LLM, and falling back to the parser when it fails.
import { describe, it, expect, vi, beforeEach } from "vitest";

// A plain function rather than a vi.fn: vitest 4 fails a test whose vi.fn threw, even when the code under test caught it.
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
const llm = vi.hoisted(() => ({ fail: false }));
vi.mock("../src/lib/llm", () => ({
  complete: async (req: unknown) => {
    if (llm.fail) throw new Error("no key");
    return complete(req);
  },
}));

import { checkLlmSetlist, readSetlist } from "../src/lib/setlistRead";

const good = { services: [{ name: " First Service ", sections: [{ name: "Praise", songs: [{ title: " Otuaka ", alternatives: [" Iron breaker "], artist: "Eben" }] }] }] };

beforeEach(() => {
  complete.mockReset();
  llm.fail = false;
});

describe("checkLlmSetlist", () => {
  it("accepts valid JSON and trims strings", () => {
    expect(checkLlmSetlist(JSON.stringify(good))).toEqual([{ name: "First Service", sections: [{ name: "Praise", songs: [{ title: "Otuaka", alternatives: ["Iron breaker"], artist: "Eben" }] }] }]);
  });

  it("strips json code fences", () => {
    expect(checkLlmSetlist("```json\n" + JSON.stringify(good) + "\n```")?.[0].name).toBe("First Service");
  });

  it("returns null for prose, a wrong shape, or zero songs", () => {
    expect(checkLlmSetlist("Here is your setlist!")).toBeNull();
    expect(checkLlmSetlist(JSON.stringify({ services: "nope" }))).toBeNull();
    expect(checkLlmSetlist(JSON.stringify({ services: [{ name: "A", sections: [{ name: "P", songs: [{ title: "" }] }] }] }))).toBeNull();
  });

  it("caps at 20 services × 20 sections × 40 songs", () => {
    const songs = Array.from({ length: 50 }, (_, i) => ({ title: `S${i}`, alternatives: [] }));
    const sections = Array.from({ length: 25 }, () => ({ name: "P", songs }));
    const services = Array.from({ length: 25 }, (_, i) => ({ name: `X${i}`, sections }));
    const out = checkLlmSetlist(JSON.stringify({ services }))!;
    expect(out).toHaveLength(20);
    expect(out[0].sections).toHaveLength(20);
    expect(out[0].sections[0].songs).toHaveLength(40);
  });
});

describe("readSetlist", () => {
  it("falls back with readWithoutAi=true when complete throws", async () => {
    llm.fail = true;
    expect(await readSetlist("Praise\n• Otuaka")).toEqual({ readWithoutAi: true, services: [{ name: "Service", sections: [{ name: "Praise", songs: [{ title: "Otuaka", alternatives: [] }] }] }] });
  });

  it("falls back when the output fails the check", async () => {
    complete.mockResolvedValue("Sorry, I can't");
    expect((await readSetlist("• Otuaka")).readWithoutAi).toBe(true);
  });

  it("uses the LLM result with readWithoutAi=false", async () => {
    complete.mockResolvedValue(JSON.stringify(good));
    const r = await readSetlist("anything");
    expect(r.readWithoutAi).toBe(false);
    expect(r.services[0].sections[0].songs[0].title).toBe("Otuaka");
    expect(complete.mock.calls[0][0].system).toContain("never invent");
  });
});
