import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { deflateRawSync, crc32 } from "node:zlib";
import { readSongbookFile } from "../src/lib/vpc";
import { parseVideoPsalmSongbook } from "../src/lib/videopsalm";

/** Build a real zip the way VideoPsalm does: one entry, deflated, no data descriptor. */
function makeZip(files: { name: string; content: string; store?: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.from(f.content, "utf8");
    const data = f.store ? raw : deflateRawSync(raw);
    const method = f.store ? 0 : 8;
    const name = Buffer.from(f.name, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(raw), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const BOOK = '{Songs:[{Guid:"g1",Text:"My Song",Verses:[{Text:"La la la"}]}]}';

describe("reading an uploaded songbook file", () => {
  it("passes a plain .json file through as text", () => {
    expect(readSongbookFile(Buffer.from(BOOK, "utf8"))).toBe(BOOK);
  });

  it("unwraps the .json inside a deflated .vpc", () => {
    const zip = makeZip([{ name: "CONFESSIONS.json", content: BOOK }]);
    expect(readSongbookFile(zip)).toBe(BOOK);
  });

  it("unwraps a stored (uncompressed) entry", () => {
    const zip = makeZip([{ name: "CONFESSIONS.json", content: BOOK, store: true }]);
    expect(readSongbookFile(zip)).toBe(BOOK);
  });

  it("picks the .json entry when the archive carries other files too", () => {
    const zip = makeZip([
      { name: "thumbnail.png", content: "not json" },
      { name: "Bible verses.json", content: BOOK },
    ]);
    expect(readSongbookFile(zip)).toBe(BOOK);
  });

  it("keeps UTF-8 lyrics intact through the unzip", () => {
    const book = '{Songs:[{Guid:"g",Text:"Jésus règne — Alléluia",Verses:[{Text:"Ọlọ́run dára"}]}]}';
    expect(readSongbookFile(makeZip([{ name: "b.json", content: book }]))).toBe(book);
  });

  it("explains itself when the archive holds no files", () => {
    const empty = makeZip([]);
    expect(() => readSongbookFile(empty)).toThrow(/empty/i);
  });

  it("feeds the VideoPsalm parser straight from .vpc bytes", () => {
    const zip = makeZip([{ name: "CONFESSIONS.json", content: BOOK }]);
    const r = parseVideoPsalmSongbook(readSongbookFile(zip));
    expect(r.songs.map((s) => s.title)).toEqual(["My Song"]);
  });
});

describe("real VideoPsalm .vpc export", () => {
  const path = "SongBooks/CONFESSIONS.vpc";
  it.skipIf(!fs.existsSync(path))("imports the songs the media team exported", () => {
    const r = parseVideoPsalmSongbook(readSongbookFile(fs.readFileSync(path)));
    expect(r.songs.length).toBeGreaterThan(0);
    for (const s of r.songs) expect(s.title.length).toBeGreaterThan(0);
  });
});

describe("guarding against a zip that expands without bound", () => {
  it("refuses an entry that unpacks past the limit, without inflating it", () => {
    const zip = makeZip([{ name: "huge.json", content: "x".repeat(5000) }]);
    expect(() => readSongbookFile(zip, 1000)).toThrow(/too large/i);
  });

  it("still reads an entry that fits", () => {
    const zip = makeZip([{ name: "ok.json", content: BOOK }]);
    expect(readSongbookFile(zip, 1000)).toBe(BOOK);
  });
});
