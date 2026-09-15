"use client";

import { memo } from "react";
import { messageLabel, type LibraryEntry, type LibraryGroup } from "@/lib/messageLibrary";
import { itemKey } from "@/lib/setlistEdit";

interface Props {
  groups: LibraryGroup[];
  /** The message the keyboard points at in search results. */
  active: number | null;
  copied: ReadonlySet<string>;
  /** The tab decides: one part copies at once, several open the message. */
  onPick: (entry: LibraryEntry) => void;
  onAdd: (entry: LibraryEntry) => void;
  onHover: (messageId: number) => void;
}

/**
 * The library by section. Each row is two sibling buttons, never one inside the
 * other: the row copies or opens, the + adds to the setlist. The + only exists
 * where the section can go in a setlist, so an apology never offers it.
 */
function MessageList({ groups, active, copied, onPick, onAdd, onHover }: Props) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-800 bg-ink-900/60">
      {groups
        .filter((g) => g.messages.length > 0)
        .map(({ section, messages }) => (
          <section key={section.id} aria-label={section.name}>
            <h3 className="border-y border-ink-800 bg-ink-950/95 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{section.name}</h3>
            <ul className="divide-y divide-ink-800">
              {messages.map((message) => {
                const entry = { section, message };
                const label = messageLabel(section, message);
                return (
                  <li key={message.id} className="flex items-stretch">
                    <button
                      onClick={() => onPick(entry)}
                      onMouseEnter={() => onHover(message.id)}
                      aria-current={active === message.id ? "true" : undefined}
                      className={`min-w-0 flex-1 px-4 py-3 text-left hover:bg-ink-800/60 ${active === message.id ? "bg-ink-800/60" : ""}`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 font-medium wrap-anywhere">{message.title}</span>
                        <span className="shrink-0 text-xs text-[var(--muted)]">
                          {message.parts.length > 1 ? `${message.parts.length} parts` : ""}
                          {copied.has(itemKey({ kind: "message", id: message.id })) && <span className="ml-2 text-emerald-400">✓</span>}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-[var(--muted)]">{message.parts[0]}</span>
                    </button>
                    {section.inService && (
                      <button
                        onClick={() => onAdd(entry)}
                        aria-label={`Add ${label} to the setlist`}
                        title="Add to the setlist"
                        className="grid min-h-11 min-w-11 shrink-0 place-items-center self-start text-lg text-[var(--muted)] hover:bg-ink-800 hover:text-ink-200"
                      >
                        +
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}

export default memo(MessageList);
