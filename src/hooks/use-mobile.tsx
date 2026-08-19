import * as React from "react";

// Tablet portrait and unfolded phones need the stacked touch layout too;
// the desktop game dock only has enough width at 1024px and above.
//
// Uses hysteresis (two thresholds with a gap) instead of one fixed
// breakpoint: several iPad models sit right around 1024px in landscape, and
// Safari's Split View/Slide Over or a plain device rotation can nudge the
// viewport width across a single threshold mid-game, forcing every
// consumer of this hook to swap between two entirely different JSX
// branches — which unmounts and remounts every component in the branch
// that goes away (including the game board) even though nothing about the
// match state changed. A gap absorbs that: once in mobile mode, width has
// to clear DESKTOP_ENTER before switching to desktop; once in desktop
// mode, width has to drop below MOBILE_ENTER before switching back. Small
// width jitter from browser chrome/orientation near the old single
// threshold no longer flips the layout.
const MOBILE_ENTER = 1000;
const DESKTOP_ENTER = 1064;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mqlMobile = window.matchMedia(`(max-width: ${MOBILE_ENTER - 1}px)`);
    const mqlDesktop = window.matchMedia(`(min-width: ${DESKTOP_ENTER}px)`);
    const recompute = () => {
      setIsMobile((prev) => {
        const width = window.innerWidth;
        if (width < MOBILE_ENTER) return true;
        if (width >= DESKTOP_ENTER) return false;
        // Inside the dead zone: keep whatever mode we're already in. Only
        // on the very first measurement (prev is undefined) is there no
        // "already in" state to stick with, so fall back to the plain
        // midpoint check just for that initial read.
        return prev ?? width < 1024;
      });
    };
    mqlMobile.addEventListener("change", recompute);
    mqlDesktop.addEventListener("change", recompute);
    recompute();
    return () => {
      mqlMobile.removeEventListener("change", recompute);
      mqlDesktop.removeEventListener("change", recompute);
    };
  }, []);

  return !!isMobile;
}
