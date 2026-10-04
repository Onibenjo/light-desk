// Kept apart from theme.ts, which uses client hooks, so the server layout can import it.
export const THEME_KEY = "ld_theme";

/**
 * Runs in <head> before first paint, so a pinned theme never flashes the other
 * one. No stored choice leaves the attribute off and the CSS follows the device.
 */
export const THEME_BOOT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

