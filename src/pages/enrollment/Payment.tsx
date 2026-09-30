import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TierKey } from "@/lib/plans";

/**
 * Older enrolment links (/enroll/payment?tier=…) land here. Paid plans are
 * only bought through the product checkout, so this resolves the product for
 * the stored plan key and hands over to the front-page checkout (which also
 * handles signing in first).
 */
export default function Payment() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tier = (params.get("tier") as TierKey) || "robin";
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Practitioner training is by application only.
    if (tier === "owl") { navigate("/prospectus", { replace: true }); return; }
    if (tier === "wren") { navigate("/enroll/details?tier=wren&billing=monthly", { replace: true }); return; }
    (async () => {
      const { data: level } = await supabase.from("access_levels").select("key").eq("subscription_tier", tier).maybeSingle();
      const { data: product } = level?.key
        ? await supabase.from("products").select("id").eq("grants_level_key", level.key).eq("active", true).limit(1).maybeSingle()
        : { data: null };
      if (!product?.id) { setError("This plan isn't available to buy online. Please contact us."); return; }
      navigate(`/?buy=${product.id}`, { replace: true });
    })();
  }, [tier, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      {error ? (
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">{error}</p>
          <Link to="/" className="text-primary underline">See memberships</Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Opening secure checkout…</p>
      )}
    </div>
  );
}
