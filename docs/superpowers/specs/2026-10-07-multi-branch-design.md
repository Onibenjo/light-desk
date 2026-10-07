# Multi-branch Lightdesk — design

Decided 2026-10-07. Lightdesk today serves one CLC branch (Ilorin). Other CLC
branches will use the same deployment.

## Decisions

- **One deployment, one database.** Rows that belong to one branch carry a
  `branch_id`. No per-branch deployments, no URL routing per branch.
- **The PIN identifies the branch.** Each branch has its own church PIN and
  admin PIN. Unlocking with a PIN puts the device in that branch for a year,
  as today. PINs are unique across all branches.
- **Shared:** the songbook (`songs`), the verse cache, message sections.
  Any branch admin may edit or import songs; the fix reaches every branch.
  A song edit records which branch made it (`songs.edited_by`).
- **Per branch:** service orders (`setlists`, one active per branch) and the
  copy log (`sent_log`).
- **Engagement library, two layers:**
  1. Shared messages (`messages.branch_id IS NULL`). Any branch admin may edit
     them; the edit reaches every branch.
  2. Branch-only messages (`messages.branch_id = X`), seen only by that branch:
     its pastors, its local programmes.
- **Branch values as tokens.** A shared message may contain `{key}` tokens
  (e.g. `{offeringAccounts}`, `{testimonyEmail}`, `{midweekTime}`). Each
  branch keeps a key → text map. Tokens are filled when the message is shown
  and copied. A message whose token has no value in this branch is not copied;
  the operator is told which key is missing. `[DATE]`-style placeholders keep
  their meaning (typed by hand for one service).
- **Same chat format everywhere.** "Sirs and Mas", verse layout and the Mixlr
  limit are not per branch. Ambience Jewel is the choir for every branch, so it
  stays literal text.
- **Managing branches** (create, reset PINs) needs a `NETWORK_PIN` env value,
  sent with each request. There is no network session.
- **No downtime for Ilorin.** The first boot creates branch 1 from the
  existing `CHURCH_PIN` / `ADMIN_PIN`; existing rows become branch 1's or
  shared; devices already unlocked stay unlocked.

## Out of scope (later, if wanted)

- Per-branch overrides of a shared message (copy-on-write) or hiding one.
- Generating pastor variants from a per-branch people list.
- Per-branch chat format or translation default.
