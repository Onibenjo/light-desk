import Icon from "./Icon";
import { DeniedHint } from "./SongEditor";
import { withLead, unlockHref, type Failure } from "@/lib/apiError";

/**
 * What did not happen, why, and the one thing to do about it: try again, or
 * unlock when the device's PIN has gone. After a write, the unlock link opens a
 * new tab so text typed on the page survives. `pin` is the PIN the page needs:
 * the admin PIN, or the church PIN for pages any unlocked device may use.
 */
export default function Problem({ failure, lead, onRetry, next, newTab, pin = "admin" }: { failure: Failure; lead: string; onRetry?: () => void; next: string; newTab: boolean; pin?: "admin" | "church" }) {
  if (pin === "admin" && failure.kind === "denied") return <DeniedHint />;
  const unlock = pin === "admin" ? "Enter the admin PIN" : "Enter the PIN";
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-fg">
      <Icon name="warn" className="h-4 w-4 shrink-0" />
      <p className="min-w-0 wrap-anywhere">{withLead(lead, failure.message)}</p>
      {failure.kind === "locked" ? (
        <a
          href={unlockHref(next)}
          target={newTab ? "_blank" : undefined}
          rel={newTab ? "noopener noreferrer" : undefined}
          className="link inline-flex items-center pointer-coarse:min-h-11"
        >
          {newTab ? `${unlock} in a new tab` : unlock}
        </a>
      ) : (
        onRetry && (
          <button onClick={onRetry} className="btn border-warn-line text-warn-fg hover:border-warn-line hover:bg-warn-bg">
            Try again
          </button>
        )
      )}
    </div>
  );
}
