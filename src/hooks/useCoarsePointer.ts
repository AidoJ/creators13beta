import { useEffect, useState } from "react";

/** Returns true on touch-first devices (iPad, iPhone, Android) where the
 *  primary pointer is coarse and HTML5 native drag-and-drop is unreliable
 *  (and shows iOS selection-highlight rectangles during long-press).
 *  We use this to disable the `draggable` HTML attribute on touch and rely
 *  solely on the pointer-event drag fallback. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(hover: none), (pointer: coarse)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const handler = (e: MediaQueryListEvent) => setCoarse(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  return coarse;
}
