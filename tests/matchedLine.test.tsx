import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchedLine } from "../src/app/MatchedLine";
import { buildIndex, searchSongs, type SnippetRange } from "../src/lib/songSearch";

const render = (text: string, ranges: SnippetRange[]) => renderToStaticMarkup(<MatchedLine text={text} ranges={ranges} />);
const marked = (html: string) => [...html.matchAll(/<mark[^>]*>([^<]*)<\/mark>/g)].map((m) => m[1]);
const plain = (html: string) => html.replace(/<[^>]+>/g, "");

describe("MatchedLine", () => {
  it("marks the matched word and leaves the rest of the line alone", () => {
    const html = render("That saved a wretch like me", [{ start: 13, end: 19 }]);
    expect(marked(html)).toEqual(["wretch"]);
    expect(plain(html)).toBe("That saved a wretch like me");
  });

  it("renders a line with nothing matched unchanged", () => {
    expect(render("Amazing grace", [])).toBe("Amazing grace");
  });

  it("marks a word at the very start and at the very end", () => {
    const html = render("hold me close", [{ start: 0, end: 4 }, { start: 8, end: 13 }]);
    expect(marked(html)).toEqual(["hold", "close"]);
    expect(plain(html)).toBe("hold me close");
  });

  it("marks exactly the words the search matched, and nothing else", () => {
    const book = buildIndex([{ guid: "x", title: "X", sections: ["That saved a wretch like me"] }]);
    const s = searchSongs(book, "wretch like me")[0].snippet!;
    const html = render(s.text, s.ranges);
    expect(marked(html)).toEqual(["wretch", "like", "me"]);
    expect(plain(html)).toBe("That saved a wretch like me");
  });
})
