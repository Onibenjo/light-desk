import { ensureSchema } from "@/db";
import { branchesWithChannel, endOpenServices, recordSnapshot, type Recorded } from "@/db/attendance";
import { POLL_MS } from "./attendance";
import { fetchChannel, type MixlrResult } from "./mixlr";
import { collectCodes, deliverReports, type Bot } from "./attendanceTelegram";

/** What one poll did for one branch. Returned by the tick route, so a cron log shows it. */
export type PollOutcome = { branchId: number; channel: string } & (Recorded | { kind: "not-found" } | { kind: "unreachable"; reason: string } | { kind: "failed"; reason: string });

/**
 * One round: look at every branch's Mixlr channel and write down what is
 * there. Run every five minutes by the timer below, or by a scheduler calling
 * POST /api/attendance/tick where no process stays up to hold a timer.
 *
 * One branch failing (its channel renamed, Mixlr timing out, the database
 * refusing a write) never stops the others, and nothing is thrown: there is
 * nobody to catch it. When Mixlr cannot be reached the branch's open service
 * is left open — "couldn't look" is not "off air", and the next round five
 * minutes on settles it.
 */
export async function pollAttendance(now: number = Date.now(), look: (channel: string) => Promise<MixlrResult> = fetchChannel, bot?: Bot): Promise<PollOutcome[]> {
  await ensureSchema();
  const targets = await branchesWithChannel();
  const outcomes = await Promise.all(
    targets.map(async ({ branchId, channel }): Promise<PollOutcome> => {
      try {
        const result = await look(channel);
        // Not found is Mixlr's answer, not a failure to ask: the channel is not on air, so nothing of it is either.
        if (result.kind === "not-found") await endOpenServices(branchId);
        if (result.kind !== "ok") return { branchId, channel, ...result };
        return { branchId, channel, ...(await recordSnapshot(branchId, result.snapshot, now)) };
      } catch (e) {
        return { branchId, channel, kind: "failed", reason: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
  await sendToTelegram(now, bot);
  return outcomes;
}

/**
 * After the readings: connect any chat that sent its code, then post the
 * reports of services that just ended. After, not before, so a service that
 * went off air this round is reported this round. Telegram trouble is logged
 * and shown on /attendance; it never fails the round.
 */
async function sendToTelegram(now: number, bot?: Bot): Promise<void> {
  try {
    const linked = await collectCodes(now, bot?.send);
    if (typeof linked === "object") console.error(`[attendance] Telegram, reading the bot's messages: ${linked.error}`);
    for (const d of await deliverReports(now, bot)) {
      if (d.error) console.error(`[attendance] Telegram, branch ${d.branchId}: ${d.error}`);
      else if (d.posted.length > 0) console.log(`[attendance] Telegram, branch ${d.branchId}: posted the report for service ${d.posted.join(", ")}`);
    }
  } catch (e) {
    console.error("[attendance] Telegram:", e);
  }
}

const globalForTimer = globalThis as unknown as { __ldAttendanceTimer?: ReturnType<typeof setTimeout>; __ldAttendanceLoop?: number };

/** Milliseconds from `now` to the next :00, :05, :10… A hair past it, so a timer that fires a millisecond early still lands in the right slot. */
export function untilNextPoll(now: number): number {
  return POLL_MS - (now % POLL_MS) + 250;
}

/**
 * Starts the five-minute round inside the server process (called once from
 * src/instrumentation.ts). Rounds are on the clock, not five minutes after
 * boot, so the 6:00 and 6:30 readings are taken at 6:00 and 6:30.
 *
 * Each round schedules the next only after it finishes, so a slow round can
 * never overlap itself. The timer is unref'd: it must not keep a process alive
 * that is otherwise ready to exit. Kept on globalThis so a dev-server reload
 * replaces the timer rather than adding a second one.
 */
export function startAttendanceTimer(): void {
  clearTimeout(globalForTimer.__ldAttendanceTimer);
  // A round already running when the timer is restarted must not schedule another once it finishes, or two loops run.
  const loop = (globalForTimer.__ldAttendanceLoop ?? 0) + 1;
  globalForTimer.__ldAttendanceLoop = loop;
  const schedule = () => {
    if (globalForTimer.__ldAttendanceLoop !== loop) return;
    const timer = setTimeout(() => {
      void pollAttendance()
        .then((outcomes) => {
          // Trouble is logged; the routine (live, off air) is not, or the log is two lines every five minutes forever.
          for (const o of outcomes) {
            if (o.kind === "not-found") console.error(`[attendance] Mixlr has no channel "${o.channel}" (branch ${o.branchId})`);
            else if (o.kind === "unreachable" || o.kind === "failed") console.error(`[attendance] branch ${o.branchId} (${o.channel}): ${o.reason}`);
            else if (o.kind === "live" && o.started) console.log(`[attendance] branch ${o.branchId} (${o.channel}) is live; recording service ${o.serviceId}`);
          }
        })
        .catch((e) => console.error("[attendance] poll failed:", e))
        .finally(schedule);
    }, untilNextPoll(Date.now()));
    timer.unref?.();
    globalForTimer.__ldAttendanceTimer = timer;
  };
  schedule();
}
