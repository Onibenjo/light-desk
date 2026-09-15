// Arrow-key movement across a tab bar, kept free of React and the DOM.

/**
 * Where a key press moves the selection in a row of `count` tabs, following the
 * WAI-ARIA tabs pattern: Left and Right step and wrap around, Home and End jump
 * to the ends. Null means the key is not a tab-bar key and should be left alone.
 */
export function tabIndexForKey(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (current + 1) % count;
    case "ArrowLeft":
      return (current - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
