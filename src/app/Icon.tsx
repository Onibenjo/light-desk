/**
 * The desk's few icons, drawn once so they look the same on the church laptop
 * (Windows) and a phone, take `currentColor`, and stay out of the accessible
 * name. Emoji did none of those: 📌 was a red pin whatever the state.
 */
const PATHS = {
  book: "M3 4.5C3 3.7 3.7 3 4.5 3H9c1.1 0 2 .9 2 2v11.5c0-.8-.7-1.5-1.5-1.5H3V4.5ZM21 4.5c0-.8-.7-1.5-1.5-1.5H15c-1.1 0-2 .9-2 2v11.5c0-.8.7-1.5 1.5-1.5H21V4.5ZM11 5v14M13 5v14",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  message: "M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5H10l-4.5 4v-4h0c-.8 0-1.5-.7-1.5-1.5v-9ZM8 9h8M8 12.5h5",
  pin: "M9 3h6M10 3v6.5L6.5 13.5V15h11v-1.5L14 9.5V3M12 15v6",
  check: "M4.5 12.5 9.5 17.5 19.5 6.5",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "h-4 w-4", filled = false }: { name: IconName; className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 1.5 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
