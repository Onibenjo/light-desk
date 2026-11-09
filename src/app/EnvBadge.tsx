import { connection } from "next/server";

/** ENV_LABEL, e.g. "Staging", or null when this is the real desk. Read per request, so the host can set it without a rebuild. */
export async function envLabel(): Promise<string | null> {
  await connection();
  return process.env.ENV_LABEL?.trim() || null;
}

/** A pill at the top of every page on a test copy, so nobody mistakes it for the real desk. Nothing when ENV_LABEL is unset. */
export default async function EnvBadge() {
  const label = await envLabel();
  if (!label) return null;
  return (
    <p
      role="note"
      className="pointer-events-none fixed top-0 left-1/2 z-50 -translate-x-1/2 rounded-b-lg border border-t-0 border-warn-line bg-warn-bg px-3 py-1 font-mono whitespace-nowrap text-[11px] font-bold tracking-[0.14em] text-warn-fg uppercase"
    >
      {label}
      <span className="hidden sm:inline"> · not the live desk</span>
    </p>
  );
}
