import { sameString } from "./constantTime";

const MIN_SECRET = 16;
let warnedShort = false;

/**
 * True only when CRON_SECRET is set and the request carries it, as
 * `Authorization: Bearer <secret>` (what Vercel Cron sends) or `x-cron-secret`.
 * Unset means closed: the tick route does nothing useful for a stranger, but
 * each call makes the server fetch from Mixlr, and that should not be open to
 * anyone who finds the address.
 */
export function cronSecretOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  if (secret.length < MIN_SECRET) {
    if (!warnedShort) {
      warnedShort = true;
      console.error(`CRON_SECRET must be at least ${MIN_SECRET} characters; /api/attendance/tick stays closed until it is.`);
    }
    return false;
  }
  const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  const sent = bearer ?? req.headers.get("x-cron-secret") ?? "";
  return sameString(sent.trim(), secret);
}
