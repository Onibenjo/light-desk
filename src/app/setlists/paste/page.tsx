"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { failureFrom, OFFLINE, type Failure } from "@/lib/apiError";
import { defaultServiceDate } from "@/lib/setlistImport";
import type { MatchStatus } from "@/lib/setlistMatch";
import PageShell from "../../PageShell";
import Problem from "../../Problem";

type Song = { title: string; alternatives: string[]; artist?: string; match: MatchStatus; removed?: boolean };
type Service = { name: string; exists: boolean; sections: { name: string; songs: Song[] }[] };
type Saved = { name: string; left: string[] };

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function post<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; failure: Failure }> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, failure: OFFLINE };
  }
  if (!res.ok) return { ok: false, failure: await failureFrom(res) };
  return { ok: true, data: (await res.json()) as T };
}

/** The song's id when it will be saved: matched, or picked from the candidates. */
function chosen(song: Song): number | null {
  return !song.removed && song.match.status === "matched" ? song.match.song.id : null;
}

export default function PasteSetlistPage() {
  const pathname = usePathname();
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => isoDay(defaultServiceDate(new Date())));
  const [services, setServices] = useState<Service[] | null>(null);
  const [withoutAi, setWithoutAi] = useState(false);
  const [failure, setFailure] = useState<{ failure: Failure; lead: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Saved[] | null>(null);
  // Every order the branch has, so renaming a card onto one still warns that it will be replaced.
  const [existing, setExisting] = useState<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/setlists")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { setlists?: { name: string }[] } | null) => d?.setlists && setExisting(new Set(d.setlists.map((x) => x.name))))
      .catch(() => {});
  }, [saved]);
  const [adding, setAdding] = useState<{ s: number; c: number; i: number; lyrics: string } | null>(null);

  const update = (s: number, c: number, i: number, patch: Partial<Song>) =>
    setServices((all) => all && all.map((svc, si) => (si !== s ? svc : { ...svc, sections: svc.sections.map((sec, ci) => (ci !== c ? sec : { ...sec, songs: sec.songs.map((x, ii) => (ii !== i ? x : { ...x, ...patch })) })) })));

  async function read() {
    setBusy(true);
    setFailure(null);
    setSaved(null);
    const r = await post<{ services: Service[]; readWithoutAi: boolean }>("/api/setlists/parse", { text, date });
    setBusy(false);
    if (!r.ok) return setFailure({ failure: r.failure, lead: "Not read." });
    setServices(r.data.services);
    setWithoutAi(r.data.readWithoutAi);
  }

  async function save() {
    if (!services) return;
    setBusy(true);
    setFailure(null);
    const orders = services.map((svc) => ({ name: svc.name.trim(), songIds: svc.sections.flatMap((sec) => sec.songs.flatMap((x) => chosen(x) ?? [])) }));
    const r = await post<unknown>("/api/setlists/import", { orders });
    setBusy(false);
    if (!r.ok) return setFailure({ failure: r.failure, lead: "Not saved." });
    setSaved(services.map((svc) => ({ name: svc.name.trim(), left: svc.sections.flatMap((sec) => sec.songs.filter((x) => !x.removed && chosen(x) === null).map((x) => x.title)) })));
    setServices((all) => all && all.map((svc) => ({ ...svc, exists: true })));
  }

  async function quickAdd() {
    if (!adding || !services) return;
    const song = services[adding.s].sections[adding.c].songs[adding.i];
    setBusy(true);
    setFailure(null);
    const r = await post<{ song: { id: number; title: string } }>("/api/songs/quick-add", { title: song.title, lyrics: adding.lyrics });
    setBusy(false);
    if (!r.ok) return setFailure({ failure: r.failure, lead: "Song not added." });
    update(adding.s, adding.c, adding.i, { match: { status: "matched", song: { id: r.data.song.id, title: r.data.song.title } } });
    setAdding(null);
  }

  return (
    <PageShell
      title="Paste setlist"
      purpose="Paste the choir's setlist. Each service becomes a service order, with its songs matched to the song bank."
      actions={
        <Link href="/setlists" className="btn btn-sm btn-quiet">
          Service orders
        </Link>
      }
    >
      {failure && <Problem failure={failure.failure} lead={failure.lead} next={pathname} newTab pin="church" />}

      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={8000} aria-label="Setlist" placeholder={"FIRST SERVICE\nFirst worship\nVictor's crown – Darlene Zschech\nPraise\n• …"} className="field w-full font-text" />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          Service date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
        </label>
        <button onClick={read} disabled={busy || !text.trim() || !date} className="btn btn-primary">
          Read setlist
        </button>
      </div>

      {services && withoutAi && <p className="text-sm text-[var(--muted)]">Read without AI; check the grouping.</p>}

      {services?.map((svc, s) => (
        <section key={s} className="card overflow-hidden">
          <div className="space-y-1 border-b border-ink-700 px-4 py-3">
            <input
              value={svc.name}
              onChange={(e) => setServices((all) => all && all.map((x, i) => (i === s ? { ...x, name: e.target.value } : x)))}
              aria-label="Service order name"
              className="w-full rounded-none border-0 border-b border-dashed border-ink-600 bg-transparent px-1 py-1 font-ui text-xl font-semibold focus:border-solid focus:border-accent focus:outline-none"
            />
            {(svc.exists || existing.has(svc.name.trim())) && <p className="text-sm text-amber-400">This will replace the existing order</p>}
          </div>
          {svc.sections.map((sec, c) => (
            <div key={c} className="px-4 py-2">
              {sec.name && <h3 className="text-xs font-semibold tracking-wide text-[var(--muted)] uppercase">{sec.name}</h3>}
              <ul className="divide-y divide-ink-700">
                {sec.songs.map((song, i) =>
                  song.removed ? null : (
                    <li key={i} className="py-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${song.match.status === "matched" ? "bg-green-500" : song.match.status === "pick" ? "bg-amber-400" : "bg-red-500"}`} />
                        <span className="min-w-0 flex-1 text-[15px]">
                          {song.title}
                          {song.match.status === "matched" && song.match.song.title !== song.title && <span className="text-[var(--muted)]"> → {song.match.song.title}</span>}
                          {song.match.status === "missing" && <span className="sr-only"> (not in song bank)</span>}
                        </span>
                        {song.match.status === "pick" && (
                          <select
                            aria-label={`Which song is ${song.title}?`}
                            defaultValue=""
                            onChange={(e) => {
                              const pick = song.match.status === "pick" ? song.match.candidates.find((x) => x.id === Number(e.target.value)) : undefined;
                              if (pick) update(s, c, i, { match: { status: "matched", song: pick } });
                            }}
                            className="field"
                          >
                            <option value="" disabled>
                              Pick one…
                            </option>
                            {song.match.candidates.map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.title}
                              </option>
                            ))}
                          </select>
                        )}
                        {song.match.status === "missing" && (
                          <button onClick={() => setAdding({ s, c, i, lyrics: "" })} disabled={busy} className="btn btn-sm">
                            Add to song bank
                          </button>
                        )}
                        <button onClick={() => update(s, c, i, { removed: true })} disabled={busy} aria-label={`Remove ${song.title}`} className="btn btn-quiet btn-icon text-lg">
                          ×
                        </button>
                      </div>
                      {adding && adding.s === s && adding.c === c && adding.i === i && (
                        <div className="mt-2 space-y-2 pl-4">
                          <textarea value={adding.lyrics} onChange={(e) => setAdding({ ...adding, lyrics: e.target.value })} rows={6} aria-label={`Lyrics for ${song.title}`} placeholder="Paste the lyrics" className="field w-full font-text" />
                          <div className="flex gap-2">
                            <button onClick={quickAdd} disabled={busy || !adding.lyrics.trim()} className="btn btn-primary">
                              Save song
                            </button>
                            <button onClick={() => setAdding(null)} className="btn btn-quiet">
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </section>
      ))}

      {services && (
        <button onClick={save} disabled={busy} className="btn btn-primary self-start">
          Save orders
        </button>
      )}

      {saved && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            Saved. <Link href="/setlists">Open service orders</Link>
          </p>
          {saved
            .filter((o) => o.left.length > 0)
            .map((o) => (
              <div key={o.name}>
                <p className="font-semibold">
                  {o.name} — Not in song bank yet
                </p>
                <ul className="list-disc pl-5">
                  {o.left.map((t, k) => (
                    <li key={k}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </PageShell>
  );
}
