/**
 * How long a lookup must run before the "Looking up…" indicator appears.
 *
 * Bundled-KJV and cache hits answer in 0–12ms. Showing a spinner for those only
 * makes the page jump — it mounts, pushes everything below it down, and vanishes
 * again a few milliseconds later. Every network source takes at least 336ms, so
 * this delay sits in the empty band between the two and shows the indicator when
 * (and only when) there is actually a wait to report.
 */
export const BUSY_DELAY_MS = 200;
