/**
 * The message of SQLite's UNIQUE refusal, or null for any other error. Drizzle
 * wraps the driver's error, so the message worth reading can be one or two
 * `cause`s down.
 */
export function uniqueViolation(e: unknown): string | null {
  for (let current: unknown = e; current instanceof Error; current = current.cause) {
    if (/UNIQUE/i.test(current.message)) return current.message;
  }
  return null;
}

export function isUniqueViolation(e: unknown): boolean {
  return uniqueViolation(e) !== null;
}
