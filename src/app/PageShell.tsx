import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import Icon from "./Icon";
import ThemeToggle from "./ThemeToggle";

/**
 * The frame of every page that isn't the desk: the way back, the page's name
 * in the serif with one line on what it is for, then the page. One width, one
 * header, one back control, so /log and /messages read as the same app.
 */
export default function PageShell({ title, purpose, actions, children }: { title: string; purpose?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-7 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-7">
      <header className="rise space-y-6">
        <div className="flex items-center justify-between">
          <Link href="/" className="btn btn-quiet group -ml-2 gap-2 px-2">
            <Icon name="back" className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            <Image src="/brand/clc-logo.png" alt="" width={20} height={20} className="h-5 w-5 rounded-full" />
            Desk
          </Link>
          <ThemeToggle />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-4 border-b border-ink-700 pb-6">
          <div className="min-w-0">
            <h1 className="display text-[40px] sm:text-[52px]">{title}</h1>
            {purpose && <p className="mt-2.5 max-w-prose text-[15px] leading-relaxed text-ink-400">{purpose}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      </header>
      {children}
    </main>
  );
}
