/**
 * Marks the setlist the desk is using. The orange dot is the same "you are
 * here" as the cursor in a song; the word carries the meaning.
 */
export default function ActiveBadge() {
  return (
    <span className="badge">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
      Active
    </span>
  );
}
