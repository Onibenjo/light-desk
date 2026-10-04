"use client";

export type OnAir = { text: string; at: number };

const time = (at: number) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * The program monitor: what is on the clipboard right now, as it will land in
 * Mixlr. Whatever tab copied it — a verse, a song section, a greeting — this
 * is the last thing to check before pasting.
 */
export default function OnClipboard({ item }: { item: OnAir | null }) {
  const lines = item ? item.text.split("\n").filter((l) => l.trim()) : [];
  return (
    <section aria-label="On the clipboard" className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-ink-700 px-3.5 py-2.5">
        <span className="flex items-center gap-2">
          <span key={item?.at ?? 0} className={item ? "tally pop" : "tally tally-off"} />
          <span className="eyebrow text-ink-200">{item ? "On clipboard" : "Clipboard"}</span>
        </span>
        {item && <span className="font-mono text-[10.5px] text-[var(--muted)] tabular-nums">{time(item.at)}</span>}
      </div>
      {item ? (
        <div key={item.at} className="fade-in space-y-1 px-3.5 py-3">
          <p className="line-clamp-2 font-ui text-[13px] leading-snug font-semibold text-ink-50">{lines[0]}</p>
          {lines.length > 1 && <p className="line-clamp-3 font-text text-[12.5px] leading-relaxed text-ink-400">{lines.slice(1).join(" ")}</p>}
          <p className="pt-1 font-mono text-[10px] tracking-wide text-[var(--muted)]">
            {item.text.length.toLocaleString("en")} chars · paste in Mixlr
          </p>
        </div>
      ) : (
        <p className="px-3.5 py-3 font-text text-[12.5px] leading-relaxed text-[var(--muted)]">Nothing copied since the desk opened. Whatever you copy shows here, exactly as it will paste.</p>
      )}
    </section>
  );
}
