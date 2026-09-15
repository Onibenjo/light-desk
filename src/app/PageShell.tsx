import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * The frame of every page that isn't the desk: the way back, the page's name
 * and one line on what it is for, then the page. One width, one header, one
 * back control, so /log and /messages read as the same app as the desk.
 */
export default function PageShell({ title, purpose, actions, children }: { title: string; purpose?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-5">
      <header className="space-y-3 border-b border-ink-800 pb-5">
        <Link href="/" className="btn btn-quiet -ml-2 gap-2 px-2">
          <span aria-hidden="true">←</span>
          <Image src="/brand/clc-logo.png" alt="" width={20} height={20} className="h-5 w-5 rounded-full" />
          Desk
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-3xl leading-tight font-semibold">{title}</h1>
            {purpose && <p className="mt-1 max-w-prose text-[15px] text-[var(--muted)]">{purpose}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </header>
      {children}
    </main>
  );
}
