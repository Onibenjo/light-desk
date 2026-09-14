import { describe, it, expect } from "vitest";
import { ARMED_MS, SETTLE_MS, armedAnnouncement, pressOutcome } from "../src/app/useArmed";

const what = "the setlist Sunday 14 Sept";

describe("pressOutcome", () => {
  it("arms on the first press", () => {
    expect(pressOutcome(null, 3, what, 1000)).toEqual({ kind: "arm", armed: { key: 3, what, at: 1000 } });
  });

  it("deletes on a second press of the same row", () => {
    const armed = { key: 3, what, at: 1000 };
    expect(pressOutcome(armed, 3, what, 1000 + SETTLE_MS + 200)).toEqual({ kind: "confirm" });
  });

  it("does not take a double click as the second press", () => {
    const armed = { key: 3, what, at: 1000 };
    expect(pressOutcome(armed, 3, what, 1000 + SETTLE_MS - 1)).toEqual({ kind: "ignore" });
  });

  it("re-arms a different row instead of deleting it", () => {
    const armed = { key: "section:1", what: "the section Greetings", at: 1000 };
    const next = pressOutcome(armed, "section:2", "the section Recap", 1000 + SETTLE_MS + 200);
    expect(next).toEqual({ kind: "arm", armed: { key: "section:2", what: "the section Recap", at: 1000 + SETTLE_MS + 200 } });
  });

  it("treats a press after the arming lapsed as a first press", () => {
    const armed = { key: 3, what, at: 1000 };
    expect(pressOutcome(armed, 3, what, 1000 + ARMED_MS).kind).toBe("arm");
  });
});

describe("armedAnnouncement", () => {
  it("names what a second press deletes, kept verbatim", () => {
    expect(armedAnnouncement("the message Pastor’s welcome 🙏 é")).toBe("Press again to delete the message Pastor’s welcome 🙏 é");
  });
});
