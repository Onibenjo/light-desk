"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

import { THEME_KEY as KEY } from "./themeBoot";

const listeners = new Set<() => void>();

function current(): Theme {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === "light" || pinned === "dark") return pinned;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener("change", fn);
  return () => {
    listeners.delete(fn);
    mq.removeEventListener("change", fn);
  };
}

/** The theme on screen, and a toggle that pins the other one on this device. */
export function useTheme(): [Theme, () => void] {
  // Dark on the server: the booth is the default room.
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as Theme);
  const toggle = useCallback(() => {
    const next: Theme = current() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Nowhere to remember it; it still switches for this visit.
    }
    listeners.forEach((fn) => fn());
  }, []);
  return [theme, toggle];
}
