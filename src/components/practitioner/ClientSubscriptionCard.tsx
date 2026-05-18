import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TIERS } from "@/lib/tiers";
import type { TierKey } from "@/lib/tiers";
import { CreditCard, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SubData {
  tier: TierKey;
  status: string;
  billing_period: string | null;
  current_period_end: string | null;
  current_period_start: string | null;
}

interface ClientSubscriptionCardProps {
  clientId: string;
}

export default function ClientSubscriptionCard({ clientId }: ClientSubscriptionCardProps) {
  const [sub, setSub] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (supabase
      .from("client_subscription_summary" as any)
      .select("tier, status, billing_period, current_period_end, current_period_start")
      .eq("user_id", clientId)
      .maybeSingle() as any)
      .then(({ data }: { data: SubData | null }) => {
        if (data) setSub(data);
        setLoading(false);
      });
  }, [clientId]);

  if (loading) return null;
  if (!sub) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No subscription found for this client.</p>
      </div>
    );
  }

  const tierInfo = TIERS[sub.tier];
  const monthlyPrice = tierInfo?.monthlyPrice || 0;
  const statusColor = sub.status === "active"
    ? "bg-green-500/10 text-green-600 border-green-500/20"
    : sub.status === "past_due"
    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
    : "bg-red-500/10 text-red-600 border-red-500/20";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-display font-bold text-foreground">Subscription</h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground text-xs">Plan</span>
          <p className="font-semibold text-foreground capitalize">{tierInfo?.name || sub.tier} — {tierInfo?.subtitle || ""}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Status</span>
          <div><Badge variant="outline" className={`text-xs capitalize ${statusColor}`}>{sub.status.replace(/_/g, " ")}</Badge></div>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Monthly Fee</span>
          <p className="font-semibold text-foreground">{monthlyPrice === 0 ? "Free" : `$${monthlyPrice} AUD`}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Billing</span>
          <p className="font-medium text-foreground capitalize">{sub.billing_period || "monthly"}</p>
        </div>
      </div>

      {sub.current_period_end && (
        <div className="text-xs text-muted-foreground">
          Next billing: <span className="font-medium text-foreground">{new Date(sub.current_period_end).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}</span>
        </div>
      )}
    </div>
  );
}
