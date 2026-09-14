"use client";

import { useCallback, useEffect, useId, useState } from "react";

/** How long an armed Delete waits for its second press before it goes back to "Delete". */
export const ARMED_MS = 4000;

/**
 * A second press this soon after arming is the same tap bouncing, or a double
 * click, not a decision: it is ignored rather than taken as "yes, delete".
 */
export const SETTLE_MS = 400;

export interface Armed<K> {
  key: K;
  /** What a second press deletes, in words: "the setlist Sunday 14 Sept". */
  what: string;
  at: number;
}

export type PressOutcome<K> = { kind: "arm"; armed: Armed<K> } | { kind: "confirm" } | { kind: "ignore" };

/** What one press of a two-press Delete does, given what is armed now. */
export function pressOutcome<K>(armed: Armed<K> | null, key: K, what: string, now: number): PressOutcome<K> {
  if (armed === null || armed.key !== key || now - armed.at >= ARMED_MS) return { kind: "arm", armed: { key, what, at: now } };
  if (now - armed.at < SETTLE_MS) return { kind: "ignore" };
  return { kind: "confirm" };
}

/** The sentence a screen reader hears when a Delete arms. It names the button's armed label, "Confirm delete". */
export function armedAnnouncement(what: string): string {
  return `Choose Confirm delete to delete ${what}`;
}

/**
 * Two-press Delete for a list of rows. The first press arms one row's button
 * ("Confirm delete") and announces what a second press will delete; it disarms by
 * itself after ARMED_MS, or as soon as focus leaves that button. The page
 * renders `announcement` in a live region with id `regionId` that stays
 * mounted, so the arming is heard.
 */
export function useArmed<K extends string | number>() {
  const [armed, setArmed] = useState<Armed<K> | null>(null);
  const regionId = useId();

  useEffect(() => {
    if (armed === null) return;
    const timer = setTimeout(() => setArmed(null), ARMED_MS);
    return () => clearTimeout(timer);
  }, [armed]);

  const disarm = useCallback(() => setArmed(null), []);

  const isArmed = (key: K) => armed?.key === key;

  /**
   * Props for one row's Delete button: the second press calls `onConfirm`, a
   * blur disarms, and the armed button is described by the announcement.
   * React re-renders between two clicks, so `armed` here is never stale.
   */
  const buttonProps = (key: K, what: string, onConfirm: () => void) => ({
    onClick: () => {
      const outcome = pressOutcome(armed, key, what, Date.now());
      if (outcome.kind === "arm") setArmed(outcome.armed);
      else if (outcome.kind === "confirm") onConfirm();
    },
    onBlur: () => {
      if (armed?.key === key) disarm();
    },
    "aria-describedby": armed?.key === key ? regionId : undefined,
  });

  return {
    isArmed,
    disarm,
    buttonProps,
    regionId,
    announcement: armed ? armedAnnouncement(armed.what) : "",
  };
}
