import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SetlistBar from "../src/app/SetlistBar";
import type { MessageRow, SetlistRow, SongRow } from "../src/lib/setlist";

const row = (over: Partial<SongRow> & { id: number; title: string }): SongRow => ({
  kind: "song",
  key: `song:${over.id}`,
  author: null,
  song: { id: over.id, title: over.title, sections: ["la la"] },
  missing: false,
  ...over,
});

const note = (over: Partial<MessageRow> & { id: number; title: string }): MessageRow => ({
  kind: "message",
  key: `message:${over.id}`,
  parts: ["Sirs and Mas"],
  edited: false,
  removed: false,
  waiting: false,
  ...over,
});

const render = (rows: SetlistRow[], staleNote: string | null = null, copied: string[] = []) =>
  renderToStaticMarkup(
    <SetlistBar name="Sunday 14 Sept" staleNote={staleNote} rows={rows} copied={new Set(copied)} onOpen={() => {}} onMessage={() => {}} />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();

describe("the setlist the operator sees", () => {
  it("numbers the items in the order they were prepared", () => {
    const t = text(render([row({ id: 1, title: "Way Maker" }), note({ id: 2, title: "Greetings · Sunday" })]));
    expect(t).toContain("1\n🎵\nWay Maker");
    expect(t).toContain("2\n💬\nGreetings · Sunday");
  });

  it("credits the author on every row, which is the whole reason searching was ambiguous", () => {
    expect(render([row({ id: 1, title: "Way Maker", author: "Sinach" })])).toContain("Sinach");
  });

  it("names the setlist", () => {
    expect(render([row({ id: 1, title: "Way Maker" })])).toContain("Sunday 14 Sept");
  });

  it("says nothing about age when the setlist is fresh", () => {
    expect(render([row({ id: 1, title: "Way Maker" })])).not.toContain("days old");
  });

  it("warns in amber when it is last week's list", () => {
    const html = render([row({ id: 1, title: "Way Maker" })], "8 days old");
    expect(html).toContain("8 days old");
    expect(html).toContain("amber");
  });

  it("shows a deleted song as gone rather than dropping the row and losing the count", () => {
    const html = render([row({ id: 1, title: "Way Maker" }), row({ id: 9, title: "Old One", song: null, missing: true })]);
    expect(text(html)).toContain("Old One");
    expect(html).toContain("no longer in the songbook");
  });

  it("makes a deleted song untappable, so it cannot look like a dead button", () => {
    const html = render([row({ id: 9, title: "Old One", song: null, missing: true })]);
    // The attribute, not the word: every row's classes contain "disabled:".
    expect(html).toContain('disabled=""');
  });

  it("tells you what to do with a setlist that has nothing in it yet", () => {
    expect(render([])).toContain("Nothing in it yet");
  });
});

describe("messages in the setlist bar", () => {
  it("marks songs and messages apart", () => {
    const html = render([row({ id: 1, title: "Way Maker" }), note({ id: 2, title: "Greetings · Sunday" })]);
    expect(html).toContain("🎵");
    expect(html).toContain("💬");
  });

  it("says when a message's text was edited for this service", () => {
    expect(render([note({ id: 2, title: "Next Service · Midweek", edited: true })])).toContain("edited");
    expect(render([note({ id: 2, title: "Next Service · Midweek" })])).not.toContain("edited");
  });

  it("ticks what has been copied this session, and nothing else", () => {
    const html = render([note({ id: 2, title: "Greetings · Sunday" }), note({ id: 3, title: "Prayer · Queen" })], null, ["message:2"]);
    expect(html.match(/✓/g)).toHaveLength(1);
  });

  it("says how many posts a long message is", () => {
    expect(render([note({ id: 4, title: "Confession · Full text", parts: ["a", "b", "c"] })])).toContain("3 parts");
  });

  it("disables a message with nothing to copy, and says why", () => {
    const gone = render([note({ id: 5, title: "Gone", parts: null, removed: true })]);
    expect(gone).toContain("no longer in the library");
    // The attribute, not the word: every row's classes contain "disabled:".
    expect(gone).toContain('disabled=""');
    expect(render([note({ id: 6, title: "Loading", parts: null, waiting: true })])).toContain("library not loaded");
  });

  it("keeps a removed message with edited text working, with a quiet note", () => {
    const html = render([note({ id: 7, title: "Kept", parts: ["mine"], edited: true, removed: true })]);
    expect(html).toContain("removed from library");
    expect(html).not.toContain('disabled=""');
  });
});
