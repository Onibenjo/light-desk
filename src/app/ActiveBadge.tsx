/**
 * Marks the setlist the desk is using. The orange dot is the same "you are
 * here" as the cursor in a song; the word carries the meaning.
 */
export default function ActiveBadge() {
  return (
    <span className="badge badge-accent">
      <span aria-hidden="true" className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
      Active
    </span>
  );
}
