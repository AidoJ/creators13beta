import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TIERS } from "@/lib/tiers";
import type { TierKey } from "@/lib/tiers";
import { ArrowRight, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { loadEnrollmentState } from "@/lib/enrollmentGate";
import { getNextEnrollmentStep, type EnrollmentStep } from "@/lib/enrollmentSteps";


interface SubData {
  tier: TierKey;
  status: string;
  billing_period: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
}

export default function SubscriptionCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [sub, setSub] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [nextStep, setNextStep] = useState<EnrollmentStep | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: subData }, { data: profData }] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("tier, status, billing_period, current_period_end, stripe_subscription_id")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("profiles")
          .select("reached_checkout_at")
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (subData) setSub(subData as SubData);
      try {
        const s = await loadEnrollmentState(user.id);
        if (!cancelled) setNextStep(getNextEnrollmentStep(s, (profData as any)?.reached_checkout_at ?? null));
      } catch {
        /* non-fatal */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);


  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      if (error) {
        // Try to read the structured error body from the edge function
        let msg = "Could not open subscription portal.";
        try {
          const ctx: any = (error as any).context;
          if (ctx?.text) {
            const body = await ctx.text();
            const parsed = JSON.parse(body);
            if (parsed?.message) msg = parsed.message;
            else if (parsed?.error) msg = parsed.error;
          }
        } catch { /* ignore */ }
        toast({ title: "Subscription unavailable", description: msg, variant: "destructive" });
        return;
      }
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Could not open subscription portal.", variant: "destructive" });
    }
    setPortalLoading(false);
  };

  if (loading) return null;
  if (!sub) return null;

  const tierInfo = TIERS[sub.tier];
  const monthlyPrice = tierInfo?.monthlyPrice || 0;
  const isPaid = monthlyPrice > 0;

  const statusColor = sub.status === "active"
    ? "bg-green-500/10 text-green-600 border-green-500/20"
    : sub.status === "past_due"
    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
    : "bg-red-500/10 text-red-600 border-red-500/20";

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-display font-bold text-foreground">My Subscription</h3>
        </div>
        <Badge variant="outline" className={`text-xs capitalize ${statusColor}`}>
          {sub.status.replace(/_/g, " ")}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground text-xs">Plan</span>
          <p className="font-semibold text-foreground">{tierInfo?.name || sub.tier} — {tierInfo?.subtitle || ""}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Monthly Fee</span>
          <p className="font-semibold text-foreground">{isPaid ? `$${monthlyPrice} AUD / ${sub.billing_period || "month"}` : "Free"}</p>
        </div>
      </div>

      {sub.current_period_end && (
        <p className="text-xs text-muted-foreground">
          Next payment due: <span className="font-medium text-foreground">
            {new Date(sub.current_period_end).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </p>
      )}

      {nextStep && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="text-sm">
            <p className="font-semibold text-foreground">Your onboarding isn't finished yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Next: {nextStep.label} · Step {nextStep.index} of {nextStep.total}
            </p>
          </div>
          <Button
            size="sm"
            className="w-full"
            onClick={() => navigate(nextStep.route)}
          >
            Continue onboarding
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}



      {isPaid && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleManageSubscription}
          disabled={portalLoading}
          className="w-full"
        >
          {portalLoading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ExternalLink className="h-4 w-4 mr-2" />
          )}
          Manage / Cancel Subscription
        </Button>
      )}
    </div>
  );
}
