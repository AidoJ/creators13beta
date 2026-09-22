import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Feature access for the signed-in user, resolved from the access grid
 * (entitlements -> levels -> features) via the my_features() function.
 *
 * This is the replacement for tier-based permission checks. Display of a
 * plan name still reads subscriptions.tier — that is not a permission.
 */
export function useFeatures() {
  const { user } = useAuth();
  const [features, setFeatures] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setFeatures(new Set());
      setReady(true);
      return;
    }
    setReady(false);
    (async () => {
      const { data } = await (supabase as any).rpc("my_features");
      if (cancelled) return;
      const keys = (data || []).map((r: any) =>
        typeof r === "string" ? r : r.feature_key ?? r.key
      );
      setFeatures(new Set(keys.filter(Boolean)));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    ready,
    features,
    has: (key: string) => features.has(key),
  };
}
