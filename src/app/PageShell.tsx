import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";
import LiveClock from "./LiveClock";

/**
 * The frame of every page that isn't the desk: the way back, the page's name
 * in the serif with one line on what it is for, then the page. One width, one
 * header, one back control, so /log and /messages read as the same app.
 */
export default function PageShell({ title, purpose, actions, children }: { title: string; purpose?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6">
      <header className="rise space-y-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="btn btn-quiet group -ml-2 gap-2.5 px-2">
            <Icon name="back" className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <Image src="/brand/clc-logo.png" alt="" width={22} height={22} className="h-[22px] w-[22px] rounded-full" />
            <span className="font-display text-[17px] font-bold tracking-[-0.03em] text-ink-50">Desk</span>
          </Link>
          <div className="flex items-center gap-3">
            <LiveClock compact />
            <ThemeToggle />
          </div>
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-x-4 gap-y-5 border-b border-ink-700 pb-7">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.16em] text-[var(--muted)] uppercase">
              <span aria-hidden="true" className="tally" />
              Lightdesk <span className="text-ink-600">/</span> <span className="text-ink-200">{title}</span>
            </p>
            <h1 className="display mt-3 text-[44px] sm:text-[64px]">{title}</h1>
            {purpose && <p className="mt-3 max-w-prose text-[15px] leading-relaxed text-ink-400">{purpose}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          {/* The orange foot of the title rule: the page's one mark. */}
          <span aria-hidden="true" className="meter-in absolute bottom-[-1px] left-0 h-[2px] w-16 bg-accent shadow-[0_0_12px_var(--accent-glow)]" />
        </div>
      </header>
      {children}
    </main>
  );
}
