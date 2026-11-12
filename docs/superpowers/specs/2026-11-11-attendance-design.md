# Mixlr attendance — design

Decided 2026-11-11. A subteam logs how many people are listening on Mixlr every
half hour of a service (a 5:30pm service: 6:00, 6:30, 7:00, 7:30… until it
ends), averages the numbers, and sends them on WhatsApp. Lightdesk now takes
those numbers itself and keeps them.

## Decisions

- **Where the number comes from.** Mixlr's channel page loads one public JSON
  document, `https://apicdn.mixlr.com/v3/channel_view/<channel>`, which says
  whether the channel is live and carries the current broadcast's
  `listener_count`, its start, and the scheduled event it belongs to (title,
  `starts_at`, `ends_at`). No account or key. It is undocumented, so the
  parser checks every field and reads anything unexpected as off air; a round
  that cannot reach Mixlr is skipped, not recorded as off air.
- **Who reads it.** The server, every five minutes on the clock (:00, :05…),
  whether or not anyone has the page open. In Docker a timer started from
  `src/instrumentation.ts` runs the round; on Vercel, or by choice, a scheduler
  calls `POST /api/attendance/tick` with `CRON_SECRET`. Both can run: one
  reading per service per five-minute slot is enforced by a unique index, and
  a new service by another.
- **Half-hour readings, not half-hourly polling.** Readings every five minutes
  give the peak and survive a missed round. The report picks the reading
  nearest each half hour (within six minutes). The first half hour is 30
  minutes after the scheduled start when Mixlr's schedule is within an hour of
  the real start, else after the real start, rounded to the half hour. The
  average is of the half-hour readings (the team's own method); a service too
  short to have one averages every reading and says so. The peak is the
  highest of all readings.
- **A service is a Mixlr event.** Readings belong to `event:<id>`, or
  `broadcast:<uid>` for an unscheduled broadcast. A dropped broadcast that
  comes back under the same event within three hours is the same service; an
  event reused on another day is a new one. A service ends at its last
  reading once the channel is off air.
- **Per branch.** Each branch has its own Mixlr channel
  (`branches.mixlr_channel`, set at `/attendance` with the admin PIN, checked
  against Mixlr before it is saved). Only branch 1 (Ilorin, `clc-ilorin`) is
  set to start; another branch is one setting away.
- **Tied to the service order.** A new service is linked to the branch's
  active service order as it goes live; the operator can change or clear the
  link on the service's page (church PIN). The link is a plain id, so deleting
  a service order is never blocked by an old service.
- **Who can see it.** Any device unlocked with the branch's church PIN reads
  the record. Setting the channel and deleting a service (a sound check that
  went out) need the admin PIN.
- **The report.** "Copy report" puts the WhatsApp text on the clipboard:
  title in bold, the day and branch, one line per half hour, the average and
  the peak with its time. Times are written the way the team writes them
  (6:00pm), in the reader's time zone.
- **Kept.** `services` and `listener_readings` are in the backup tables; like
  the log, they cannot be rebuilt after the fact.

## Out of scope (later, if wanted)

- Sending the report to WhatsApp automatically.
- Counts from other platforms (YouTube, Facebook) beside Mixlr.
- Editing a reading by hand, or entering a service Mixlr did not broadcast.
- Charts across services (attendance by week, by service type).
