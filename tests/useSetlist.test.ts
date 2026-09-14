import { describe, it, expect } from "vitest";
import { describeFailure, OFFLINE } from "../src/lib/apiError";
import { addToast, notAdded, notStarted } from "../src/app/useSetlist";

const locked = describeFailure(401, "locked");
const toast = (result: ReturnType<typeof notAdded>) => addToast(result, "Greetings · Sunday", "Sunday 20 Sep");

describe("adding to the setlist fails", () => {
  it("keeps the server's own sentence when it refused the item itself", () => {
    const refusal = describeFailure(400, "Apologies cannot go in a setlist");
    expect(notAdded(refusal)).toEqual({ refused: "Apologies cannot go in a setlist" });
  });

  it("says it was not added, and why, when the connection dropped or the device is locked", () => {
    expect(toast(notAdded(OFFLINE))).toEqual({ text: `Not added. ${OFFLINE.message}`, tone: "err" });
    expect(toast(notAdded(locked)).text).toMatch(/^Not added\. .*PIN/);
  });

  it("never reads a proxy's HTML as the reason", () => {
    expect(toast(notAdded(describeFailure(502, null))).text).not.toMatch(/html/i);
  });

  it("marks nothing as created, so a form may stay open for another try", () => {
    const result = notAdded(OFFLINE);
    expect(typeof result === "object" && result.created).toBeFalsy();
  });
});

describe("starting a setlist fails part way", () => {
  const base = { name: "Sunday 20 Sep", title: "Greetings · Sunday" };

  it("before anything exists: says it was not started, and keeps the name rule's own words", () => {
    expect(notStarted({ ...base, step: "create", failure: OFFLINE })).toEqual({ refused: `Setlist not started. ${OFFLINE.message}` });
    const nameRule = describeFailure(400, "A setlist needs a name of 1 to 80 characters");
    expect(notStarted({ ...base, step: "create", failure: nameRule })).toEqual({ refused: "A setlist needs a name of 1 to 80 characters" });
  });

  it("created but not made active: names what exists and sends the operator to the Setlists page", () => {
    const result = notStarted({ ...base, step: "activate", failure: locked });
    expect(result).toMatchObject({ created: "Sunday 20 Sep" });
    const text = toast(result).text;
    expect(text).toContain("Created Sunday 20 Sep");
    expect(text).toContain("isn't active");
    expect(text).toContain('"Greetings · Sunday" isn\'t in it');
    expect(text).toContain("Setlists page");
  });

  it("active but the first item missing: says it started, what is missing, and why", () => {
    const result = notStarted({ ...base, step: "add", failure: OFFLINE });
    expect(result).toEqual({ refused: `Started Sunday 20 Sep, but "Greetings · Sunday" isn't in it. ${OFFLINE.message}`, created: "Sunday 20 Sep" });
  });

  it("leaves long names, diacritics and emoji exactly as typed", () => {
    const name = "Sunday 20 Sep — Crèche & Choir 🎉 " + "x".repeat(40);
    const result = notStarted({ name, title: "Prière · Élan 🙏", step: "activate", failure: OFFLINE });
    expect(toast(result).text).toContain(name);
    expect(toast(result).text).toContain('"Prière · Élan 🙏"');
  });
});
