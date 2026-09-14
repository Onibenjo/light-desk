import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MessageList from "../src/app/MessageList";
import { groupLibrary } from "../src/lib/messageLibrary";
import { library } from "./fixtures/library";

const render = (opts: { active?: number | null; copied?: string[] } = {}) =>
  renderToStaticMarkup(
    <MessageList groups={groupLibrary(library)} active={opts.active ?? null} copied={new Set(opts.copied ?? [])} onPick={() => {}} onAdd={() => {}} onHover={() => {}} />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();

describe("the message library the operator browses", () => {
  it("lists sections in service order, skipping empty ones", () => {
    const t = text(render());
    expect(t.indexOf("Apologies")).toBeLessThan(t.indexOf("Welcoming Ambience Jewel"));
    expect(t).not.toContain("Empty");
  });

  it("previews each message's text under its title", () => {
    expect(text(render())).toContain("Sound restored\nSirs and Mas, we apologize");
  });

  it("offers + only where the section can go in a setlist", () => {
    const html = render();
    expect(html).toContain('aria-label="Add Welcoming Ambience Jewel · Sunday to the setlist"');
    expect(html).not.toContain('aria-label="Add Apologies · Sound restored to the setlist"');
  });

  it("marks the row the keyboard is on, and ticks what was copied", () => {
    const html = render({ active: 20, copied: ["message:20"] });
    expect(html).toContain('aria-current="true"');
    expect(html.match(/✓/g)).toHaveLength(1);
  });
});
