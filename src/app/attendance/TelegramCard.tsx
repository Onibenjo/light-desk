"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "../Icon";
import Problem from "../Problem";
import { failureFrom, OFFLINE, type Failure } from "@/lib/apiError";
import { formatClock } from "@/lib/attendance";
import { isTelegramStatus, type TelegramStatus } from "@/lib/attendanceView";

/** While a code is showing, the page asks the bot this often whether it has arrived. */
const CHECK_MS = 4_000;

interface Props {
  status: TelegramStatus;
  admin: boolean;
  branch: string;
}

/**
 * Where the branch's attendance reports are posted on Telegram. The admin
 * connects a chat by sending the bot a one-time code from it; after that each
 * service's report arrives there when the service ends, ready to copy into
 * WhatsApp. A church-PIN device only sees where reports go.
 */
export default function TelegramCard({ status: initial, admin, branch }: Props) {
  const pathname = usePathname();
  const [status, setStatus] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Failure | null>(null);
  const [saved, setSaved] = useState("");

  // The list page reloads every minute; its newer status wins unless a code is showing here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- following the parent's reload is the effect's whole job
    setStatus((now) => (now.code ? now : initial));
  }, [initial]);

  async function call(init: RequestInit): Promise<TelegramStatus | null> {
    let res: Response;
    try {
      res = await fetch("/api/attendance/telegram", { ...init, headers: { "Content-Type": "application/json" } });
    } catch {
      setNotice(OFFLINE);
      return null;
    }
    if (!res.ok) {
      setNotice(await failureFrom(res));
      return null;
    }
    const body: unknown = await res.json().catch(() => null);
    return isTelegramStatus(body) ? body : null;
  }

  async function act(init: RequestInit, done: (next: TelegramStatus) => string) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setSaved("");
    try {
      const next = await call(init);
      if (next) {
        setStatus(next);
        setSaved(done(next));
      }
    } finally {
      setBusy(false);
    }
  }

  // Waiting for the code: ask every few seconds until a chat sends it or it runs out.
  const waiting = status.code !== null;
  const previousChat = status.chat;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      void call({ method: "POST", body: JSON.stringify({ action: "check" }) }).then((next) => {
        if (!next) return;
        setStatus(next);
        if (next.code === null && next.chat) setSaved(`Connected — reports will be posted to ${next.chat}`);
      });
    }, CHECK_MS);
    return () => clearInterval(timer);
  }, [waiting, previousChat]);

  if (!status.configured) {
    if (!admin) return null;
    return (
      <section className="card rise space-y-2 p-4">
        <p className="eyebrow">Telegram</p>
        <p className="max-w-prose text-sm text-[var(--muted)]">
          Lightdesk can post each service&apos;s report to a Telegram group when the service ends. The server needs a bot first: make one with @BotFather and set its token as <code className="font-mono">TELEGRAM_BOT_TOKEN</code>.
        </p>
      </section>
    );
  }

  const groupLink = status.bot && status.code ? `https://t.me/${status.bot}?startgroup=${status.code}` : null;
  const chatLink = status.bot && status.code ? `https://t.me/${status.bot}?start=${status.code}` : null;

  return (
    <section className="card rise space-y-3 p-4">
      <p className="eyebrow">Telegram</p>

      {status.chat !== null ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 text-[15px] wrap-anywhere">
            Each service&apos;s report is posted to <strong>{status.chat}</strong> when the service ends.
          </p>
          {admin && !waiting && (
            <span className="flex gap-2">
              <button onClick={() => void act({ method: "POST", body: JSON.stringify({ action: "link" }) }, () => "")} disabled={busy} className="btn btn-sm">
                Change
              </button>
              <button onClick={() => void act({ method: "DELETE" }, () => "Disconnected — reports are no longer posted to Telegram")} disabled={busy} className="btn btn-sm btn-danger">
                Disconnect
              </button>
            </span>
          )}
        </div>
      ) : !waiting ? (
        admin ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="max-w-prose text-[15px] leading-relaxed text-ink-300">Post each service&apos;s report to a Telegram group (or your own chat) when the service ends, ready to copy into WhatsApp.</p>
            <button onClick={() => void act({ method: "POST", body: JSON.stringify({ action: "link" }) }, () => "")} disabled={busy} className="btn btn-primary shrink-0">
              <Icon name="send" className="h-4 w-4" />
              Connect Telegram
            </button>
          </div>
        ) : (
          <p className="max-w-prose text-[15px] leading-relaxed text-ink-300">Reports aren&apos;t posted to Telegram for {branch} yet. Someone with the admin PIN can connect a group here.</p>
        )
      ) : null}

      {status.error && (
        <p className="flex items-start gap-2 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          <Icon name="warn" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0 wrap-anywhere">The last report couldn&apos;t be posted: {status.error}. Lightdesk tries again every five minutes.</span>
        </p>
      )}

      {waiting && status.code && (
        <div className="space-y-3 rounded-lg border border-ink-700 p-3">
          <p className="text-[15px]">Send this code to the bot from the chat that should get the reports:</p>
          <p className="font-mono text-[26px] tracking-[0.2em] text-ink-50 select-all">{status.code}</p>
          <div className="flex flex-wrap gap-2">
            {groupLink && (
              <a href={groupLink} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                Add to a group
              </a>
            )}
            {chatLink && (
              <a href={chatLink} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
                Send to my own chat
              </a>
            )}
          </div>
          <p className="text-sm text-[var(--muted)]">
            The links open Telegram with the code filled in. In a group the bot is already in, send{" "}
            <code className="font-mono wrap-anywhere">
              /start{status.bot ? `@${status.bot}` : ""} {status.code}
            </code>
            . Waiting for it…{status.codeExpires ? ` The code works until ${formatClock(status.codeExpires)}.` : ""}
          </p>
        </div>
      )}

      {notice && <Problem failure={notice} lead="Telegram not changed." next={pathname} newTab />}
      <p role="status" className="text-sm text-[var(--muted)] empty:hidden">
        {saved}
      </p>
    </section>
  );
}
