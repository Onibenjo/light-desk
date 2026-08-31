// Canonical book list (index = position in KJV data), with the aliases
// volunteers actually type. Keep aliases lowercase, no punctuation.

export interface Book {
  id: number; // 0-based index into kjv.json
  name: string;
  osis: string; // OSIS id, used by YouVersion / API.Bible
  usfm: string; // 3-letter USFM code
  chapters: number;
  aliases: string[];
}

const raw: [string, string, string, number, string[]][] = [
  ["Genesis", "Gen", "GEN", 50, ["gen", "ge", "gn"]],
  ["Exodus", "Exod", "EXO", 40, ["exo", "ex", "exod"]],
  ["Leviticus", "Lev", "LEV", 27, ["lev", "le", "lv"]],
  ["Numbers", "Num", "NUM", 36, ["num", "nu", "nm", "nb"]],
  ["Deuteronomy", "Deut", "DEU", 34, ["deut", "deu", "dt", "de"]],
  ["Joshua", "Josh", "JOS", 24, ["josh", "jos", "jsh"]],
  ["Judges", "Judg", "JDG", 21, ["judg", "jdg", "jg", "jdgs"]],
  ["Ruth", "Ruth", "RUT", 4, ["rut", "ru", "rth"]],
  ["1 Samuel", "1Sam", "1SA", 31, ["1sam", "1sa", "1s", "isam", "1 sam"]],
  ["2 Samuel", "2Sam", "2SA", 24, ["2sam", "2sa", "2s", "iisam", "2 sam"]],
  ["1 Kings", "1Kgs", "1KI", 22, ["1kgs", "1ki", "1k", "1kings", "1 kgs"]],
  ["2 Kings", "2Kgs", "2KI", 25, ["2kgs", "2ki", "2k", "2kings", "2 kgs"]],
  ["1 Chronicles", "1Chr", "1CH", 29, ["1chr", "1ch", "1chron", "1 chr"]],
  ["2 Chronicles", "2Chr", "2CH", 36, ["2chr", "2ch", "2chron", "2 chr"]],
  ["Ezra", "Ezra", "EZR", 10, ["ezr", "ezra"]],
  ["Nehemiah", "Neh", "NEH", 13, ["neh", "ne"]],
  ["Esther", "Esth", "EST", 10, ["est", "esth", "es"]],
  ["Job", "Job", "JOB", 42, ["job", "jb"]],
  ["Psalms", "Ps", "PSA", 150, ["ps", "psa", "psalm", "psalms", "pss", "psm"]],
  ["Proverbs", "Prov", "PRO", 31, ["prov", "pro", "pr", "prv"]],
  ["Ecclesiastes", "Eccl", "ECC", 12, ["eccl", "ecc", "ec", "eccles", "qoh"]],
  ["Song of Solomon", "Song", "SNG", 8, ["song", "sos", "ss", "songofsolomon", "songofsongs", "canticles"]],
  ["Isaiah", "Isa", "ISA", 66, ["isa", "is"]],
  ["Jeremiah", "Jer", "JER", 52, ["jer", "je", "jr"]],
  ["Lamentations", "Lam", "LAM", 5, ["lam", "la"]],
  ["Ezekiel", "Ezek", "EZK", 48, ["ezek", "eze", "ezk"]],
  ["Daniel", "Dan", "DAN", 12, ["dan", "da", "dn"]],
  ["Hosea", "Hos", "HOS", 14, ["hos", "ho"]],
  ["Joel", "Joel", "JOL", 3, ["joel", "jl", "joe"]],
  ["Amos", "Amos", "AMO", 9, ["amos", "am"]],
  ["Obadiah", "Obad", "OBA", 1, ["obad", "ob", "oba"]],
  ["Jonah", "Jonah", "JON", 4, ["jonah", "jon", "jnh"]],
  ["Micah", "Mic", "MIC", 7, ["mic", "mi"]],
  ["Nahum", "Nah", "NAM", 3, ["nah", "na"]],
  ["Habakkuk", "Hab", "HAB", 3, ["hab", "hb"]],
  ["Zephaniah", "Zeph", "ZEP", 3, ["zeph", "zep", "zp"]],
  ["Haggai", "Hag", "HAG", 2, ["hag", "hg"]],
  ["Zechariah", "Zech", "ZEC", 14, ["zech", "zec", "zc"]],
  ["Malachi", "Mal", "MAL", 4, ["mal", "ml"]],
  ["Matthew", "Matt", "MAT", 28, ["matt", "mat", "mt"]],
  ["Mark", "Mark", "MRK", 16, ["mark", "mk", "mr", "mrk"]],
  ["Luke", "Luke", "LUK", 24, ["luke", "lk", "luk"]],
  ["John", "John", "JHN", 21, ["john", "jn", "jhn", "joh"]],
  ["Acts", "Acts", "ACT", 28, ["acts", "ac", "act"]],
  ["Romans", "Rom", "ROM", 16, ["rom", "ro", "rm"]],
  ["1 Corinthians", "1Cor", "1CO", 16, ["1cor", "1co", "1corinthians", "1 cor", "1corin"]],
  ["2 Corinthians", "2Cor", "2CO", 13, ["2cor", "2co", "2corinthians", "2 cor", "2corin"]],
  ["Galatians", "Gal", "GAL", 6, ["gal", "ga"]],
  ["Ephesians", "Eph", "EPH", 6, ["eph", "ep", "ephes"]],
  ["Philippians", "Phil", "PHP", 4, ["phil", "php", "pp", "philip"]],
  ["Colossians", "Col", "COL", 4, ["col", "co"]],
  ["1 Thessalonians", "1Thess", "1TH", 5, ["1thess", "1th", "1thes", "1 thess", "1thessalonians"]],
  ["2 Thessalonians", "2Thess", "2TH", 3, ["2thess", "2th", "2thes", "2 thess", "2thessalonians"]],
  ["1 Timothy", "1Tim", "1TI", 6, ["1tim", "1ti", "1 tim", "1timothy"]],
  ["2 Timothy", "2Tim", "2TI", 4, ["2tim", "2ti", "2 tim", "2timothy"]],
  ["Titus", "Titus", "TIT", 3, ["titus", "tit", "ti"]],
  ["Philemon", "Phlm", "PHM", 1, ["phlm", "phm", "philem", "phile"]],
  ["Hebrews", "Heb", "HEB", 13, ["heb", "he"]],
  ["James", "Jas", "JAS", 5, ["jas", "jm", "james", "ja"]],
  ["1 Peter", "1Pet", "1PE", 5, ["1pet", "1pe", "1pt", "1 pet", "1peter"]],
  ["2 Peter", "2Pet", "2PE", 3, ["2pet", "2pe", "2pt", "2 pet", "2peter"]],
  ["1 John", "1John", "1JN", 5, ["1john", "1jn", "1jo", "1 john", "1jhn"]],
  ["2 John", "2John", "2JN", 1, ["2john", "2jn", "2jo", "2 john", "2jhn"]],
  ["3 John", "3John", "3JN", 1, ["3john", "3jn", "3jo", "3 john", "3jhn"]],
  ["Jude", "Jude", "JUD", 1, ["jude", "jud", "jd"]],
  ["Revelation", "Rev", "REV", 22, ["rev", "re", "revelation", "revelations", "apoc"]],
];

export const BOOKS: Book[] = raw.map(([name, osis, usfm, chapters, aliases], id) => ({
  id,
  name,
  osis,
  usfm,
  chapters,
  aliases: [...new Set([name.toLowerCase().replace(/\s+/g, ""), ...aliases.map((a) => a.replace(/\s+/g, ""))])],
}));

const aliasIndex = new Map<string, Book>();
for (const b of BOOKS) for (const a of b.aliases) aliasIndex.set(a, b);

/** Normalise "1st cor", "I Cor", "first corinthians" etc. to the alias form. */
function normaliseBookToken(s: string): string {
  let t = s.toLowerCase().trim();
  t = t.replace(/^(first|1st|i)\s+/, "1 ").replace(/^(second|2nd|ii)\s+/, "2 ").replace(/^(third|3rd|iii)\s+/, "3 ");
  t = t.replace(/[.\s]+/g, "");
  return t;
}

/** Exact alias match, then unique prefix match (so "philipp" → Philippians). */
export function findBook(token: string): Book | undefined {
  const t = normaliseBookToken(token);
  if (!t) return undefined;
  const exact = aliasIndex.get(t);
  if (exact) return exact;
  if (t.length < 2) return undefined;
  const candidates = BOOKS.filter((b) => b.name.toLowerCase().replace(/\s+/g, "").startsWith(t));
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function bookByUsfm(usfm: string): Book | undefined {
  return BOOKS.find((b) => b.usfm === usfm.toUpperCase());
}
