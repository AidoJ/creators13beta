import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Every page change starts at the top. In-page #anchors are left alone. */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (window.location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}
