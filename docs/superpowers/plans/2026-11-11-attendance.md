# Mixlr attendance — plan

The full plan (summary, how it works, decisions, code map, data model, API,
deploy, testing, risks) is kept as a shared doc so the team can comment on it.
The design decisions are in `docs/superpowers/specs/2026-11-11-attendance-design.md`.
This file is the short list for whoever picks up the branch.

## Done on `attendance`

1. Mixlr reader — `src/lib/mixlr.ts`
2. Half-hour marks, average, peak, report — `src/lib/attendance.ts`
3. Schema: `services`, `listener_readings`, `branches.mixlr_channel`; backups
4. Data layer — `src/db/attendance.ts`
5. Five-minute round — `src/lib/attendancePoll.ts`, started by `src/instrumentation.ts`
6. Routes — `src/app/api/attendance/*` (tick exempted in `src/proxy.ts`)
7. Pages — `/attendance`, `/attendance/[id]`
8. Desk links — ⌘K, header icon, sidebar
9. Docs and checks — README, PRODUCT, Dockerfile, `docs/ui-copy.md`, spec

## Left

10. Commit (no Claude or Anthropic trailers, per AGENTS.md).
11. Push the branch and open a pull request into `main`.
12. Deploy; check the server can reach `apicdn.mixlr.com`; set
    `clc-ilorin.mixlr.com` at `/attendance` with the admin PIN.
13. Compare one live service with the team's manual count.
14. Match Copy report to the team's real WhatsApp message; retire the manual count.

## Checks

    npx vitest run && npx eslint && npx tsc --noEmit && npm run build
