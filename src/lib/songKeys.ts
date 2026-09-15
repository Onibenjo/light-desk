// Cursor maths for sending a song section by section.

/**
 * Move the section cursor, clamped at both ends. Deliberately does not wrap:
 * rolling off the last verse back to verse 1 mid-service sends the wrong text.
 * Returns -1 when there is nothing to point at.
 */
export function moveCursor(current: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  return Math.min(count - 1, Math.max(0, current + delta));
}

/** "3" → index 2, matching the number printed beside each section. */
export function digitToIndex(key: string, count: number): number | null {
  if (!/^[1-9]$/.test(key)) return null;
  const i = Number(key) - 1;
  return i < count ? i : null;
}

/**
 * Where the cursor lands when a song is opened again: just past the furthest
 * section already copied, so going back to the list for a moment doesn't lose
 * the place. Copied sections are not always contiguous (a chorus sent out of
 * order), so it is the furthest one, not the count. A song sung to its last
 * section starts again from the top: opening it again is a reprise, and the
 * first Enter must not repost the ending.
 */
export function resumeCursor(sent: ReadonlySet<number>, count: number): number {
  if (count <= 0 || sent.size === 0) return 0;
  const furthest = Math.max(...sent);
  return furthest >= count - 1 ? 0 : furthest + 1;
}

/**
 * One pin at a time: pinning a different section replaces the old one, and
 * pinning the section already pinned clears it. Null means nothing is pinned —
 * note section 0 is a real section, so this can't be a truthiness check.
 */
export function togglePin(current: number | null, i: number): number | null {
  return current === i ? null : i;
}
