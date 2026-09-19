/**
 * The one line the desk shows above the tab bar to name the newest change in
 * the operator's own terms — the quiet alternative to a modal tutorial nobody
 * would read mid-service.
 *
 * `id` is the whole mechanism: WhatsNew stores the id of the note that was
 * dismissed, not a boolean. Ship a new note by writing a new object here —
 * changing `id` to anything not already in someone's localStorage makes the
 * note reappear for every operator, even one who dismissed an earlier note,
 * because their stored id no longer matches. Editing `text` in place without
 * changing `id` reaches only people who haven't seen this note yet.
 */
export type WhatsNewNote = {
  id: string;
  text: string;
  href?: string;
  linkLabel?: string;
};

export const WHATS_NEW: WhatsNewNote = {
  id: "service-order-2026-09",
  text: "New: the service order — set up a service ahead, and its songs and messages wait at the top of Songs and Engagement.",
  href: "/setlists",
  linkLabel: "Service orders",
};
