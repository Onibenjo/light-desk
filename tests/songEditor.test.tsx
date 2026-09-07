import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SongEditor, { lyricsFromSections } from "../src/app/SongEditor";
import type { SearchableSong } from "../src/lib/songSearch";

const song: SearchableSong = { id: 7, guid: "g", title: "El Roi", author: "Prinx Emmanuel", sections: ["a\nb", "c\nd"] };
const render = (s: SearchableSong = song) =>
  renderToStaticMarkup(<SongEditor song={s} onSaved={() => {}} onDeleted={() => {}} onCancel={() => {}} showToast={() => {}} />);

describe("the textarea's starting value", () => {
  it("puts a blank line between sections, which is the break the operator edits", () => {
    expect(lyricsFromSections(["a\nb", "c\nd"])).toBe("a\nb\n\nc\nd");
  });

  it("round-trips a single section unchanged", () => {
    expect(lyricsFromSections(["only this"])).toBe("only this");
  });
});

describe("the editor form", () => {
  it("opens with the song's title, author and lyrics already in it", () => {
    const html = render();
    expect(html).toContain("El Roi");
    expect(html).toContain("Prinx Emmanuel");
    expect(html).toContain("a\nb\n\nc\nd");
  });

  it("offers Tidy, Save, Cancel and Delete", () => {
    const html = render();
    for (const label of ["Tidy", "Save", "Cancel", "Delete"]) expect(html, label).toContain(label);
  });

  it("labels every field, so the form is usable without sight", () => {
    const html = render();
    for (const label of ["Song title", "Author", "Song lyrics"]) expect(html, label).toContain(`aria-label="${label}"`);
  });

  it("explains what a blank line does, since that is the whole point", () => {
    expect(render().toLowerCase()).toContain("blank line");
  });

  it("handles a song with no author", () => {
    expect(() => render({ ...song, author: null })).not.toThrow();
  });
});
