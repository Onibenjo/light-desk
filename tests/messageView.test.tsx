import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MessageView from "../src/app/MessageView";
import type { MessageRow, SongRow } from "../src/lib/setlist";

const render = (over: Partial<Parameters<typeof MessageView>[0]> = {}) =>
  renderToStaticMarkup(
    <MessageView
      label="Confession · Full text"
      parts={["Father we thank You", "Every son and daughter", "I boldly decree and declare"]}
      edited={false}
      sent={new Set()}
      cursor={0}
      flash={null}
      addLabel="Add to the service order"
      onCopy={() => {}}
      onFocusPart={() => {}}
      onAdd={() => {}}
      onBack={() => {}}
      setlistName={null}
      place={null}
      onNext={() => {}}
      partRef={() => {}}
      {...over}
    />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, "\n").replace(/\n+/g, "\n").trim();

describe("sending a long message part by part", () => {
  it("numbers every part, in order", () => {
    const t = text(render());
    expect(t).toContain("1\nFather we thank You");
    expect(t).toContain("3\nI boldly decree and declare");
  });

  it("puts only the cursor's part in the tab order", () => {
    expect(render({ cursor: 1 }).match(/tabindex="0"/g)).toHaveLength(1);
  });

  it("marks parts already sent, and only those", () => {
    // A check and the word, not dimmed text: a copied part is often copied again.
    expect(render({ sent: new Set([0]) }).match(/<span class="sr-only">, copied<\/span>/g)).toHaveLength(1);
    expect(render()).not.toContain(", copied");
  });

  it("says when this is text edited for the service", () => {
    expect(render({ edited: true })).toContain("edited<span class=\"sr-only\"> for this service</span>");
  });

  it("hides the setlist button for a message that cannot go in one", () => {
    expect(render()).toContain("Add to the service order");
    expect(render({ addLabel: null })).not.toContain("setlist");
  });
});

describe("finding the way on from a long message", () => {
  const song: SongRow = { kind: "song", key: "song:4", id: 4, title: "Way Maker", author: null, song: null, missing: false };
  const note: MessageRow = { kind: "message", key: "message:9", id: 9, title: "Offerings · Account details", parts: ["Sirs and Mas"], edited: false, removed: false, waiting: false };

  it("keeps the way back in the header that stays pinned while the parts scroll", () => {
    const html = render();
    const header = html.slice(html.indexOf("sticky"), html.indexOf("<ol"));
    expect(text(header)).toContain("Engagement");
    expect(text(header)).toContain("Confession · Full text");
  });

  it("offers the next item of the setlist under the last part", () => {
    const t = text(render({ setlistName: "Sunday 20 Sept", place: { position: 2, count: 5, next: song, nextPosition: 3, skipped: 0 } }));
    expect(t).toContain("End of the message");
    expect(t).toContain("Next in Sunday 20 Sept · 3 of 5");
    expect(t).toContain("Song: \nWay Maker");
  });

  it("names a message as a message", () => {
    expect(text(render({ setlistName: "Sunday 20 Sept", place: { position: 1, count: 2, next: note, nextPosition: 2, skipped: 0 } }))).toContain("Message: \nOfferings · Account details");
  });

  it("won't open a next message until the library has loaded, and says so outside the button", () => {
    const loading: MessageRow = { ...note, parts: null, waiting: true };
    const html = render({ setlistName: "Sunday 20 Sept", place: { position: 1, count: 2, next: loading, nextPosition: 2, skipped: 0 } });
    expect(html).toMatch(/<button disabled=""/);
    expect(html).toMatch(/<\/button><p[^>]*>Loading the library…<\/p>/);
    expect(html).not.toContain("No longer");
  });

  it("says how many deleted items it skipped", () => {
    expect(text(render({ setlistName: "Sunday 20 Sept", place: { position: 1, count: 4, next: song, nextPosition: 3, skipped: 1 } }))).toContain(
      "1 item after this one is no longer in the songbook or library, so it",
    );
    expect(text(render({ setlistName: "Sunday 20 Sept", place: { position: 1, count: 4, next: null, nextPosition: null, skipped: 3 } }))).toContain("3 items after this one are");
  });

  it("says when this was the last item", () => {
    expect(text(render({ setlistName: "Sunday 20 Sept", place: { position: 5, count: 5, next: null, nextPosition: null, skipped: 0 } }))).toContain("That was the last item in Sunday 20 Sept.");
  });

  it("offers only the way back when the message isn't in the setlist", () => {
    const t = text(render());
    expect(t).not.toContain("Next in");
    expect(t).not.toContain("last item");
    expect(t).toContain("End of the message");
  });
});
