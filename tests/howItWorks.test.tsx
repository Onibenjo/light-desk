import { describe, it, expect, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import HowItWorks from "../src/app/HowItWorks";

const TABS = [
  { id: "verses", icon: "book", label: "Verses" },
  { id: "songs", icon: "music", label: "Songs" },
  { id: "messages", icon: "message", label: "Engagement" },
] as const;

/**
 * There is no window in this environment, so hasFinePointer() answers false and
 * the panel renders its touch wording. Standing a window up with a matching
 * media query is how the laptop wording is reached.
 */
function withPointer(fine: boolean, render: () => string): string {
  const had = "window" in globalThis;
  Object.defineProperty(globalThis, "window", { value: { matchMedia: () => ({ matches: fine }) }, configurable: true, writable: true });
  try {
    return render();
  } finally {
    if (!had) Reflect.deleteProperty(globalThis, "window");
  }
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

const panel = (fine: boolean) => withPointer(fine, () => renderToStaticMarkup(<HowItWorks open tabs={TABS} onClose={() => {}} />));
const words = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("the how-it-works panel, closed", () => {
  it("renders nothing, so the server and the first client render agree", () => {
    expect(renderToStaticMarkup(<HowItWorks open={false} tabs={TABS} onClose={() => {}} />)).toBe("");
  });
});

describe("the how-it-works panel, open", () => {
  it("ends the three steps in Mixlr, because that is where the operator's work finishes", () => {
    expect(words(panel(true))).toContain("Paste in Mixlr");
  });

  it("names every tab the desk shows", () => {
    const text = words(panel(true));
    for (const t of TABS) expect(text).toContain(t.label);
  });

  it("points at the service order and the log, so a prepared service and a re-send are both findable", () => {
    const html = panel(true);
    expect(html).toContain('href="/setlists"');
    expect(html).toContain('href="/log"');
  });
});

describe("the how-it-works panel, per device", () => {
  // The bug this guards: with both wordings in the markup and CSS hiding one,
  // a screen reader reads step 2 as "Choose Go Press Enter — the verse is copied".
  it("gives a laptop the keys and never the touch wording", () => {
    const text = words(panel(true));
    expect(text).toContain("Press Enter");
    expect(text).toContain("Alt");
    expect(text).not.toContain("Choose Go");
  });

  it("gives a phone the Go button and never keys it does not have", () => {
    const text = words(panel(false));
    expect(text).toContain("Choose Go");
    expect(text).not.toContain("Enter");
    expect(text).not.toContain("Alt");
  });
});

describe("the how-it-works panel's voice", () => {
  it("follows the voice guide: no exclamation marks, no device-specific verbs, the operator's word for a service order", () => {
    for (const text of [words(panel(true)), words(panel(false))]) {
      expect(text).not.toMatch(/!/);
      expect(text.toLowerCase()).not.toContain("click");
      expect(text.toLowerCase()).not.toMatch(/\btap\b/);
      expect(text.toLowerCase()).not.toContain("setlist");
      // "Messages" is the sermon in church speech; the tab is Engagement.
      expect(text).not.toContain("Messages");
    }
  });
});
