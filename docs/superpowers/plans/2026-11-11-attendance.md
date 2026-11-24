# Mixlr attendance — plan

The full plan (summary, how it works, decisions, code map, data model, API,
deploy, testing, risks) is kept as a shared doc so the team can comment on it.
The design decisions are in `docs/superpowers/specs/2026-11-11-attendance-design.md`.
This file is the short list for whoever picks up the branch.

## Done

1. Mixlr reader — `src/lib/mixlr.ts`
2. Half-hour marks, average, peak, report — `src/lib/attendance.ts`
3. Schema: `services`, `listener_readings`, `branches.mixlr_channel`; backups
4. Data layer — `src/db/attendance.ts`
5. Five-minute round — `src/lib/attendancePoll.ts`, started by `src/instrumentation.ts`
6. Routes — `src/app/api/attendance/*` (tick exempted in `src/proxy.ts`)
7. Pages — `/attendance`, `/attendance/[id]`
8. Desk links — ⌘K, header icon, sidebar
9. Docs and checks — README, PRODUCT, Dockerfile, `docs/ui-copy.md`, spec
10. Merged as PR #18 and deployed; `clc-ilorin` set in production
11. Telegram reports — `src/lib/telegram.ts`, `src/lib/attendanceTelegram.ts`,
    `src/db/telegram.ts`, Telegram card on `/attendance`, Send to Telegram on a
    service (PR #19)
12. "Use Mixlr title" for service order names, up to 120 characters (PR #19)
13. Half-hour updates to Telegram while a service is live (PR #22)
14. Report in the team's WhatsApp format: MIXLR ALL STATS, AVERAGE STATS,
    HIGHEST STATS, with the day and branch under the title (PR #22)
15. Admin PIN links on Attendance's admin-only messages (PR #22)

Confirmed working in production on 15 Nov 2026: half-hour updates and the
final report post to the CLC Ilorin group.

## Left

- Write up one service compared with the team's manual count, then retire the
  manual count.
- Give staging its own bot, or disconnect it from the group, so reports aren't
  posted twice.

## Checks

    npx vitest run && npx eslint && npx tsc --noEmit && npm run build
