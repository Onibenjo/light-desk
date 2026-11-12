/**
 * Runs once when the server process starts (Next's instrumentation hook).
 *
 * Its one job is to start the attendance round: every five minutes, read each
 * branch's Mixlr listener count (src/lib/attendancePoll.ts). That needs a
 * process that stays up, which the Docker deployment is. It is skipped:
 *
 * - outside the Node runtime (the proxy's edge runtime has no database);
 * - on Vercel, where functions are frozen between requests and a timer never
 *   fires — there a scheduler calls POST /api/attendance/tick instead;
 * - when ATTENDANCE_TIMER=off, for a second instance pointed at the same
 *   database, or a host that would rather drive the tick route from cron.
 *
 * The import is dynamic so the edge bundle never pulls in the database client.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL || process.env.ATTENDANCE_TIMER?.trim().toLowerCase() === "off") return;
  const { startAttendanceTimer } = await import("./lib/attendancePoll");
  startAttendanceTimer();
}
