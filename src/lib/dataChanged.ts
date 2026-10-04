import { useEffect, useRef } from "react";

/**
 * One app-wide "something I saved changed" signal, so open screens re-read
 * immediately after a visibility change, avatar upload, self-picked Creator
 * Type or subscription change — instead of only after leaving and returning.
 */
export type DataChange = "community-profile" | "avatar" | "creator-type" | "access";
const EVENT = "c13:data-changed";

export function notifyDataChanged(kind: DataChange) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: kind }));
  // Legacy listeners.
  if (kind === "creator-type") window.dispatchEvent(new Event("c13:creator-type-updated"));
  if (kind !== "access") window.dispatchEvent(new Event("c13:community-profile-updated"));
}

/** Calls `cb` on any data change (or only the listed kinds). */
export function useOnDataChanged(cb: (kind: DataChange) => void, kinds?: DataChange[]) {
  const ref = useRef(cb);
  ref.current = cb;
  const key = kinds?.join(",") ?? "";
  useEffect(() => {
    const allow = key ? key.split(",") : null;
    const h = (e: Event) => {
      const kind = (e as CustomEvent).detail as DataChange;
      if (!allow || allow.includes(kind)) ref.current(kind);
    };
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  }, [key]);
}
