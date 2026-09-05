/**
 * Whether the desk is being driven with a real pointer — a laptop trackpad or a
 * mouse — rather than a touchscreen.
 *
 * The desk pulls focus back into the search box after every send, so the
 * operator can type the next reference without reaching for the mouse. On a
 * phone that same focus throws the on-screen keyboard up over the verse that
 * was just copied, which is the one thing they need to read. So the automatic
 * focus is limited to devices with somewhere for it to go; a deliberate tap on
 * the box still focuses it and still opens the keyboard, as it should.
 */
export function hasFinePointer(): boolean {
  // Called from effects and handlers, but guard anyway: this module is imported
  // into components that render on the server first.
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: fine)").matches;
}
