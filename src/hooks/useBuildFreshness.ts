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
  /** Fetch `/build.json` right now (used by hard gates before a match). */
  recheck: () => Promise<void>;
}

export interface BuildManifest {
  buildId: string | null;
  builtAt: string | null;
  /** True only when we positively know the deployed build differs. */
  stale: boolean;
}

/** Build ids are only meaningful in a real deploy — dev bundles never gate. */
export const BUILD_CHECKS_ENABLED = APP_BUILD_HASH !== "dev-local";

/**
 * One-shot manifest read. Exported so imperative flows (creating a lobby,
 * accepting an invite) can hard-gate on the freshest possible answer instead
 * of whatever a background poll last saw.
 *
 * Never throws: offline / blocked / no manifest all resolve to
 * `stale: false`, because refusing to let someone play when we simply
 * couldn't reach the manifest is worse than the skew risk.
 */
export async function fetchBuildManifest(): Promise<BuildManifest> {
  if (!BUILD_CHECKS_ENABLED) return { buildId: null, builtAt: null, stale: false };
  try {
    const res = await fetch(`/build.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return { buildId: null, builtAt: null, stale: false };
    const body = await res.json();
    const buildId = typeof body?.buildId === "string" ? body.buildId : null;
    return {
      buildId,
      builtAt: typeof body?.builtAt === "string" ? body.builtAt : null,
      stale: !!buildId && buildId !== APP_BUILD_HASH,
    };
  } catch {
    return { buildId: null, builtAt: null, stale: false };
  }
}

/** Clear caches and reload from the network on a cache-busted URL. */
export async function forceUpdateReload(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.allSettled(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }
  // Cache-busted URL so iOS Safari can't serve the stale document again.
  const url = new URL(window.location.href);
  url.searchParams.set("v", Date.now().toString(36));
  window.location.replace(url.toString());
}

interface Options {
  /** Re-check when the tab regains focus and on a slow interval. */
  pollOnFocus?: boolean;
  /**
   * When false the hook goes completely quiet — no fetches, never stale.
   * Used mid-match: a player already in a live game must not be nudged, let
   * alone reloaded, because dropping them trips disconnect handling.
   */
  enabled?: boolean;
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
export function useBuildFreshness(options: Options | boolean = {}): BuildFreshness {
  const opts: Options = typeof options === "boolean" ? { pollOnFocus: options } : options;
  const pollOnFocus = opts.pollOnFocus ?? true;
  const enabled = opts.enabled ?? true;

  const [latestBuildId, setLatestBuildId] = useState<string | null>(null);
  const [latestBuiltAt, setLatestBuiltAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      const m = await fetchBuildManifest();
      if (m.buildId) {
        setLatestBuildId(m.buildId);
        setLatestBuiltAt(m.builtAt);
      }
    } finally {
      inFlight.current = false;
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void check();
    if (!pollOnFocus) return;
    const onFocus = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    // Long-lived tabs (the phone-beta norm) never fire focus — poll slowly too.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 5 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      window.clearInterval(timer);
    };
  }, [check, pollOnFocus, enabled]);

  const stale =
    enabled &&
    !!latestBuildId &&
    BUILD_CHECKS_ENABLED &&
    latestBuildId !== APP_BUILD_HASH;

  return {
    latestBuildId,
    latestBuiltAt,
    stale,
    update: forceUpdateReload,
    checking,
    recheck: check,
  };
}
