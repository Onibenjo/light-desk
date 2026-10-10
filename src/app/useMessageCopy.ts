"use client";

import { useCallback, useState } from "react";
import { fillTokens } from "@/lib/branchTokens";
import { partLabel, type OpenMessage } from "@/lib/messageLibrary";

interface Deps {
  /** `label` is how Last copied names what was copied. */
  copyText: (t: string, label?: string) => Promise<boolean>;
  showToast: (text: string, tone?: "ok" | "warn" | "err") => void;
  logSend: (kind: string, label: string, body: string, meta?: unknown) => void;
  /** The branch's own values for `{key}` in a message. Keep the reference stable. */
  tokens: Record<string, string>;
}

/**
 * Copying one part of a message, the same way from every place a message can
 * be copied — the Messages tab, a setlist row on either tab, ⌘K — so the toast,
 * the log entry and the ✓ tick never disagree. The ticks live only in this
 * page session; they are not progress anyone else sees.
 */
export function useMessageCopy({ copyText, showToast, logSend, tokens }: Deps) {
  const [copied, setCopied] = useState<ReadonlySet<string>>(new Set());

  const copyPart = useCallback(
    async (message: Pick<OpenMessage, "key" | "label" | "parts">, index: number): Promise<boolean> => {
      const part = message.parts[index];
      if (part === undefined) return false;
      const { text, missing } = fillTokens(part, tokens);
      if (missing.length > 0) {
        showToast(`No value for {${missing[0]}} in this branch — set it in Branch settings`, "err");
        return false;
      }
      // A throw from the clipboard is the same as a refusal: no tick, no log, a toast.
      const count = message.parts.length;
      let ok = false;
      try {
        ok = await copyText(text, partLabel(message.label, index, count));
      } catch {}
      if (!ok) {
        showToast("Couldn't copy — try again", "err");
        return false;
      }
      showToast(count > 1 ? `Copied part ${index + 1} of ${count} — paste in Mixlr` : `Copied "${message.label}" — paste in Mixlr`);
      logSend("message", partLabel(message.label, index, count), text, { part: index + 1, parts: count });
      setCopied((prev) => new Set(prev).add(message.key));
      return true;
    },
    [copyText, showToast, logSend, tokens],
  );

  return { copied, copyPart };
}
