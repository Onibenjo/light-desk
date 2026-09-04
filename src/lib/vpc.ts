// Reader for the file the media team actually uploads.
//
// VideoPsalm exports a songbook either as raw .json or as .vpc — which is just
// a zip holding that same .json (single entry, deflated, no data descriptor).
// This unwraps the zip so the parser in videopsalm.ts sees text either way.
// Node-only (zlib): keep it out of anything a client component imports.

import { inflateRawSync } from "node:zlib";

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const EOCD_MIN = 22; // fixed part, before any archive comment
const ZIP64 = 0xffffffff;

/** A songbook this side of sane; anything bigger is a mistake or an attack. */
const MAX_UNZIPPED_BYTES = 64_000_000;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

/** The end-of-central-directory record sits last, after an optional comment. */
function findEocd(buf: Buffer): number {
  const earliest = Math.max(0, buf.length - EOCD_MIN - 0xffff);
  for (let i = buf.length - EOCD_MIN; i >= earliest; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  return -1;
}

function readCentralDirectory(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("this looks like a zip but has no end-of-central-directory record");
  const count = buf.readUInt16LE(eocd + 10);
  const entries: ZipEntry[] = [];
  let at = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== CENTRAL_SIG) throw new Error("the zip central directory is corrupt");
    const nameLength = buf.readUInt16LE(at + 28);
    entries.push({
      name: buf.toString("utf8", at + 46, at + 46 + nameLength),
      method: buf.readUInt16LE(at + 10),
      compressedSize: buf.readUInt32LE(at + 20),
      uncompressedSize: buf.readUInt32LE(at + 24),
      localOffset: buf.readUInt32LE(at + 42),
    });
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return entries;
}

function extract(buf: Buffer, entry: ZipEntry, maxUnzippedBytes: number): Buffer {
  if (entry.compressedSize === ZIP64 || entry.localOffset === ZIP64) throw new Error("zip64 archives are not supported — export the songbook as .json instead");
  // The declared size rejects a bomb before inflating; maxOutputLength catches
  // an entry whose header lies about how much it unpacks to.
  if (entry.uncompressedSize > maxUnzippedBytes) throw new Error(`"${entry.name}" is too large to import (${entry.uncompressedSize} bytes)`);
  const at = entry.localOffset;
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== LOCAL_SIG) throw new Error(`the zip entry "${entry.name}" is corrupt`);
  const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  const data = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: maxUnzippedBytes });
  throw new Error(`unsupported zip compression method ${entry.method} in "${entry.name}"`);
}

/**
 * Decode an uploaded songbook to text: a .vpc is unzipped to its songbook
 * entry, anything else is read as UTF-8 as-is.
 */
export function readSongbookFile(bytes: Uint8Array, maxUnzippedBytes = MAX_UNZIPPED_BYTES): string {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!(buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b)) return buf.toString("utf8");

  const files = readCentralDirectory(buf).filter((e) => !e.name.endsWith("/"));
  const entry = files.find((e) => e.name.toLowerCase().endsWith(".json")) ?? files[0];
  if (!entry) throw new Error("this .vpc archive is empty");
  return extract(buf, entry, maxUnzippedBytes).toString("utf8");
}
