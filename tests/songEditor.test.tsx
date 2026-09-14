import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import SongEditor, { lyricsFromSections, DeniedHint, readSong, songFromBody } from "../src/app/SongEditor";
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

  it("wires Cancel to go inert the same way Save does, so a stray tap can't dismiss the form out from under an in-flight save", () => {
    // `disabled={busy}` never shows up in markup while busy is false at mount —
    // renderToStaticMarkup is a single synchronous pass, it cannot click Save and
    // observe busy turn true — so this pins the one part of that wiring visible
    // at rest: the same disabled:opacity-50 affordance Save carries. A test that
    // exercises the click and inspects Cancel mid-flight needs a DOM renderer
    // (e.g. @testing-library/react) driving a controllable mocked fetch.
    const html = render();
    const button = (label: string) => html.match(new RegExp(`<button[^>]*>${label}</button>`))?.[0];
    const save = button("Save");
    const cancel = button("Cancel");
    expect(save, "Save button").toContain("disabled:opacity-50");
    expect(cancel, "Cancel button").toContain("disabled:opacity-50");
  });
});

describe("the 403 PIN hint", () => {
  it("opens the unlock page in a new tab, so an in-progress edit survives it", () => {
    const html = renderToStaticMarkup(<DeniedHint />);
    expect(html).toContain('href="/unlock?next=/"');
    expect(html).toContain('target="_blank"');
    // Required alongside target="_blank": without it the new tab gets a
    // window.opener handle back to this one.
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe("reading a song out of a response", () => {
  it("takes a song the API sent, Yoruba diacritics and apostrophes untouched", () => {
    const sent = { id: 3, guid: "g3", title: "A F'ope f'Olorun", author: null, sections: ["Ọlọ́run ọba 🙌"], source: "manual" };
    expect(songFromBody({ ok: true, song: sent })).toEqual(sent);
  });

  it("returns null for anything that is not a song, like a proxy's page parsed as text", () => {
    expect(songFromBody(null)).toBeNull();
    expect(songFromBody("<html>Bad gateway</html>")).toBeNull();
    expect(songFromBody({ error: "locked" })).toBeNull();
    expect(readSong({ title: "No sections" })).toBeNull();
    expect(readSong({ title: "Bad sections", sections: ["ok", 4] })).toBeNull();
    expect(readSong({ sections: ["no title"] })).toBeNull();
  });

  it("sets only the keys the response carried, so spreading it over the open song keeps the rest", () => {
    const open: SearchableSong = { ...song, editedAt: "2026-09-01" };
    const saved = readSong({ id: 7, title: "El Roi (edited)", author: null, sections: ["x"] });
    expect(saved).not.toHaveProperty("editedAt");
    // An author cleared in the editor comes back as null and must replace the old one.
    expect({ ...open, ...saved }).toEqual({ ...open, title: "El Roi (edited)", author: null, sections: ["x"] });
  });
});
