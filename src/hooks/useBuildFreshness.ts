import { useCallback, useEffect, useRef, useState } from "react";
import { APP_BUILD_HASH } from "@/lib/buildInfo";

export interface BuildFreshness {
  /** Build id currently deployed on the server, or null while unknown. */
  latestBuildId: string | null;
  latestBuiltAt: string | null;
  /** True when the deployed build differs from the bundle running right now. */
  stale: boolean;
  /** Force-refresh: clears caches and reloads from the network. */
  update: () => Promise<void>;
  checking: boolean;
}

/**
 * Compares the running bundle's baked-in build id against `/build.json`, which
 * is regenerated on every deploy and fetched with `cache: "no-store"`.
 *
 * A build stamp on its own only proves what THIS phone loaded — it can't tell
 * the player it's stale. This closes that gap: it re-checks on mount and each
 * time the tab regains focus, so a phone that sat on an old cached bundle
 * finds out as soon as the player comes back to it.
 */
export function useBuildFreshness(pollOnFocus = true): BuildFreshness {
  const [latestBuildId, setLatestBuildId] = useState<string | null>(null);
  const [latestBuiltAt, setLatestBuiltAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      const res = await fetch(`/build.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return; // dev server / older deploy without the manifest
      const body = await res.json();
      if (typeof body?.buildId === "string") {
        setLatestBuildId(body.buildId);
        setLatestBuiltAt(typeof body.builtAt === "string" ? body.builtAt : null);
      }
    } catch {
      // Offline or blocked — silently keep the last known value.
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    if (!pollOnFocus) return;
    const onFocus = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [check, pollOnFocus]);

  const update = useCallback(async () => {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.allSettled(keys.map(k => caches.delete(k)));
      }
    } catch { /* best effort */ }
    // Cache-busted URL so iOS Safari can't serve the stale document again.
    const url = new URL(window.location.href);
    url.searchParams.set("v", Date.now().toString(36));
    window.location.replace(url.toString());
  }, []);

  const stale =
    !!latestBuildId &&
    APP_BUILD_HASH !== "dev-local" &&
    latestBuildId !== APP_BUILD_HASH;

  return { latestBuildId, latestBuiltAt, stale, update, checking };
}
