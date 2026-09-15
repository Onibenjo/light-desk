import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import MessageView from "../src/app/MessageView";

const render = (over: Partial<Parameters<typeof MessageView>[0]> = {}) =>
  renderToStaticMarkup(
    <MessageView
      label="Confession · Full text"
      parts={["Father we thank You", "Every son and daughter", "I boldly decree and declare"]}
      edited={false}
      sent={new Set()}
      cursor={0}
      flash={null}
      addLabel="Add to the setlist"
      onCopy={() => {}}
      onFocusPart={() => {}}
      onAdd={() => {}}
      onBack={() => {}}
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
    expect(render()).toContain("Add to the setlist");
    expect(render({ addLabel: null })).not.toContain("setlist");
  });
});
