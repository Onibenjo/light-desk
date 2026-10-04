/**
 * The desk's icons, drawn once so they look the same on the church laptop
 * (Windows) and a phone, take `currentColor`, and stay out of the accessible
 * name. One 24px grid, one 2px stroke, rounded ends.
 */
const PATHS = {
  book: "M3 4.5C3 3.7 3.7 3 4.5 3H9c1.1 0 2 .9 2 2v11.5c0-.8-.7-1.5-1.5-1.5H3V4.5ZM21 4.5c0-.8-.7-1.5-1.5-1.5H15c-1.1 0-2 .9-2 2v11.5c0-.8.7-1.5 1.5-1.5H21V4.5ZM11 5v14M13 5v14",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  message: "M4 5.5C4 4.7 4.7 4 5.5 4h13c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5H10l-4.5 4v-4h0c-.8 0-1.5-.7-1.5-1.5v-9ZM8 9h8M8 12.5h5",
  pin: "M9 3h6M10 3v6.5L6.5 13.5V15h11v-1.5L14 9.5V3M12 15v6",
  check: "M4.5 12.5 9.5 17.5 19.5 6.5",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20.5 20.5 16 16",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2",
  pulse: "M3 12h4l2.5-6 5 12 2.5-6h4",
  back: "M19 12H5M11 6l-6 6 6 6",
  forward: "M5 12h14M13 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h9.5c.8 0 1.5.7 1.5 1.5V20c0 .8-.7 1.5-1.5 1.5H9c-.8 0-1.5-.7-1.5-1.5v-9.5C7.5 9.7 8.2 9 9 9ZM4 15V5c0-.8.7-1.5 1.5-1.5H15",
  x: "M6 6l12 12M18 6 6 18",
  down: "M6 9l6 6 6-6",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  upload: "M12 15V4M7 9l5-5 5 5M4 15v3.5c0 .8.7 1.5 1.5 1.5h13c.8 0 1.5-.7 1.5-1.5V15",
  lock: "M6.5 11h11c.8 0 1.5.7 1.5 1.5v7c0 .8-.7 1.5-1.5 1.5h-11c-.8 0-1.5-.7-1.5-1.5v-7c0-.8.7-1.5 1.5-1.5ZM8 11V7.5a4 4 0 0 1 8 0V11",
  warn: "M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01",
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, className = "h-4 w-4", filled = false }: { name: IconName; className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 1.5 : 2}
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
