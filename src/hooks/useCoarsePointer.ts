import { useEffect, useState } from "react";

/** Returns true when the device has ANY coarse pointer available — i.e. it
 *  can be touched with a finger or pen, even if a fine pointer (trackpad,
 *  Apple Pencil hover, mouse) is ALSO attached.
 *
 *  We previously checked `(pointer: coarse)` (the PRIMARY pointer), which on
 *  an iPad Pro with a Magic Keyboard reports as "fine" — silently disabling
 *  the touch-drag path so finger drags fell back to native HTML5 D&D, which
 *  Safari doesn't fire. Switching to `(any-pointer: coarse)` covers that
 *  hybrid case while still being false on pure mouse-only desktops.
 *
 *  Also keeps a touchstart-event fallback for environments where the media
 *  query isn't reliable. */
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState<boolean>(() => detect());

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(any-pointer: coarse), (hover: none)");
    const handler = () => setCoarse(detect());
    mq.addEventListener?.("change", handler);
    // Some hybrid devices only reveal touch capability after the first
    // touchstart — flip on once we see one, never flip back off.
    const onFirstTouch = () => { setCoarse(true); window.removeEventListener("touchstart", onFirstTouch); };
    window.addEventListener("touchstart", onFirstTouch, { passive: true, once: true });
    return () => {
      mq.removeEventListener?.("change", handler);
      window.removeEventListener("touchstart", onFirstTouch);
    };
  }, []);

  return coarse;
}

function detect(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(any-pointer: coarse)").matches) return true;
  if (window.matchMedia?.("(hover: none)").matches) return true;
  if (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0) return true;
  return "ontouchstart" in window;
}
