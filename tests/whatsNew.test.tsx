import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import WhatsNew from "../src/app/WhatsNew";
import { WHATS_NEW } from "../src/lib/whatsNew";

describe("the desk's what's-new line, as the server can render it", () => {
  it("renders nothing before mount, so there is nothing to mismatch on hydration", () => {
    // renderToStaticMarkup never runs effects, so this is exactly what the
    // server (and the first client render) produces — the dismissal check
    // only runs after mount, once localStorage can be read.
    expect(renderToStaticMarkup(<WhatsNew />)).toBe("");
  });
});

describe("the current what's-new note", () => {
  it("has a non-empty, stable id", () => {
    expect(WHATS_NEW.id.length).toBeGreaterThan(0);
  });

  it("names the service order in the operator's terms, not the code's", () => {
    expect(WHATS_NEW.text).toContain("service order");
    expect(WHATS_NEW.text).not.toContain("setlist");
  });

  it("follows the voice guide: sentence case content, no exclamation marks, no device-specific verbs", () => {
    expect(WHATS_NEW.text).not.toMatch(/!/);
    expect(WHATS_NEW.text.toLowerCase()).not.toContain("tap ");
    expect(WHATS_NEW.text.toLowerCase()).not.toContain("click");
    expect(WHATS_NEW.text.toLowerCase()).not.toContain("oops");
  });

  it("links to the service orders page, with a label", () => {
    expect(WHATS_NEW.href).toBe("/setlists");
    expect(WHATS_NEW.linkLabel).toBeTruthy();
  });
});
