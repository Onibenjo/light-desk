"use client";

import { memo } from "react";
import Icon from "./Icon";
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
    <div className="card overflow-hidden">
      {groups
        .filter((g) => g.messages.length > 0)
        .map(({ section, messages }) => (
          <section key={section.id} aria-label={section.name}>
            <h3 className="sticky top-0 z-10 flex items-center gap-3 border-y border-ink-700 bg-ink-950/95 px-4 py-2.5 backdrop-blur"><span aria-hidden="true" className="tally h-1.5 w-1.5" /><span className="font-mono text-[11px] font-medium tracking-[0.16em] text-ink-200 uppercase">{section.name}</span></h3>
            <ul className="divide-y divide-ink-700/70">
              {messages.map((message) => {
                const entry = { section, message };
                const label = messageLabel(section, message);
                return (
                  <li key={message.id} className="flex items-stretch">
                    <button
                      onClick={() => onPick(entry)}
                      onMouseEnter={() => onHover(message.id)}
                      aria-current={active === message.id ? "true" : undefined}
                      className={`relative min-w-0 flex-1 px-4 py-3 text-left font-text transition-colors hover:bg-ink-800 ${active === message.id ? "bg-ink-800 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-accent before:shadow-[0_0_10px_var(--accent-glow)]" : ""}`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 font-ui text-[15px] font-semibold wrap-anywhere text-ink-50">{message.title}</span>
                        <span className="flex shrink-0 items-center font-ui text-xs text-[var(--muted)]">
                          {message.parts.length > 1 ? `${message.parts.length} parts` : ""}
                          {copied.has(itemKey({ kind: "message", id: message.id })) && <span className="pop ml-2 inline-grid h-5 w-5 place-items-center rounded-md bg-ok-bg text-ok-fg"><Icon name="check" className="h-3 w-3" /><span className="sr-only">copied</span></span>}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-[var(--muted)]">{message.parts[0]}</span>
                    </button>
                    {section.inService && (
                      <button
                        onClick={() => onAdd(entry)}
                        aria-label={`Add ${label} to the service order`}
                        title="Add to the service order"
                        className="grid min-h-11 min-w-12 shrink-0 place-items-center self-stretch border-l border-ink-700 text-[var(--muted)] transition-colors hover:bg-accent-soft hover:text-accent-ink"
                      >
                        <Icon name="plus" className="h-4 w-4" />
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
