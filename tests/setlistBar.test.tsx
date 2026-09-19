import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SetlistBar, { NoSetlistBar, itemCount } from "../src/app/SetlistBar";
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
    expect(t).toContain("1\nSong: \nWay Maker");
    expect(t).toContain("2\nMessage: \nGreetings · Sunday");
  });

  it("credits the author on every row, which is the whole reason searching was ambiguous", () => {
    expect(render([row({ id: 1, title: "Way Maker", author: "Sinach" })])).toContain("Sinach");
  });

  it("names the setlist", () => {
    expect(render([row({ id: 1, title: "Way Maker" })])).toContain("Sunday 14 Sept");
  });

  it("says nothing about age when the setlist is fresh", () => {
    expect(render([row({ id: 1, title: "Way Maker" })])).not.toContain("days ago");
  });

  it("warns in amber when it is last week's list", () => {
    const html = render([row({ id: 1, title: "Way Maker" })], "last changed 8 days ago");
    expect(html).toContain("last changed 8 days ago");
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
    expect(html).toContain('<span class="sr-only">Song: </span>');
    expect(html).toContain('<span class="sr-only">Message: </span>');
  });

  it("says when a message's text was edited for this service", () => {
    expect(render([note({ id: 2, title: "Next Service · Midweek", edited: true })])).toContain("edited<span class=\"sr-only\"> for this service</span>");
    expect(render([note({ id: 2, title: "Next Service · Midweek" })])).not.toContain("for this service");
  });

  it("ticks what has been copied this session, and nothing else", () => {
    const html = render([note({ id: 2, title: "Greetings · Sunday" }), note({ id: 3, title: "Prayer · Queen" })], null, ["message:2"]);
    expect(html.match(/<span class="sr-only">copied<\/span>/g)).toHaveLength(1);
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
    expect(html).toContain("no longer in the library");
    expect(html).not.toContain('disabled=""');
  });
});

describe("ticking a song in the setlist", () => {
  it("ticks a song once any of its sections was copied, the same as a message", () => {
    const html = render([row({ id: 1, title: "Way Maker" }), row({ id: 2, title: "Excess Love" })], null, ["song:1"]);
    expect(html.match(/<span class="sr-only">copied<\/span>/g)).toHaveLength(1);
    expect(text(html).indexOf("copied")).toBeLessThan(text(html).indexOf("Excess Love"));
  });
});

describe("saying what a service order is, to someone who has never made one", () => {
  const empty = () => renderToStaticMarkup(<NoSetlistBar />);

  it("names the thing, because the bar it stands in for never renders until one exists", () => {
    expect(text(empty())).toContain("Service order");
  });

  it("explains what it is for, not just that it is missing", () => {
    expect(text(empty())).toContain("so nothing is searched for while the service is running");
  });

  it("offers both ways in: the page, and the + on a result", () => {
    expect(empty()).toContain('href="/setlists"');
    expect(text(empty())).toContain("add the first item with +");
  });
});

describe("keeping the search box in reach when the service order is long", () => {
  it("caps the list height and lets it scroll instead of pushing the search box down", () => {
    const html = render([row({ id: 1, title: "Way Maker" })]);
    expect(html).toContain("max-h-[45vh]");
    expect(html).toContain("overflow-y-auto");
  });

  it("offers a collapse control, named for what pressing it does, once there is something to collapse", () => {
    const html = render([row({ id: 1, title: "Way Maker" })]);
    expect(html).toMatch(/<button type="button"[^>]*>Hide<\/button>/);
  });

  it("does not offer a collapse control over an empty setlist", () => {
    const t = text(render([]));
    expect(t).not.toContain("Hide");
    expect(t).not.toContain("Show");
  });

  it("pluralises the count the collapsed header falls back to", () => {
    expect(itemCount(1)).toBe("1 item");
    expect(itemCount(6)).toBe("6 items");
  });

  it("renders expanded on the first render, before localStorage can be read", () => {
    // Guards the SSR/hydration contract: a collapsed choice from a previous visit
    // must not be visible in the markup the server (or the first client render) sends.
    const html = render([row({ id: 1, title: "Way Maker" }), row({ id: 2, title: "Excess Love" })]);
    expect(html).toContain("Way Maker");
    expect(text(html)).toContain("Hide");
  });
});

describe("reaching the service orders page from the bar", () => {
  it("says what kind of thing the name is, so the word is learned in place", () => {
    expect(text(render([row({ id: 1, title: "Way Maker" })]))).toContain("Service order");
  });

  it("carries the link the tiny one under the search box used to carry", () => {
    const html = render([row({ id: 1, title: "Way Maker" })]);
    expect(html).toContain('href="/setlists"');
    expect(text(html)).toContain("Change");
  });
});
