import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { planNameSync } from "@/lib/plans";
import type { TierKey } from "@/lib/plans";
import { ArrowRight, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { loadEnrollmentState } from "@/lib/enrollmentGate";
import { loadMyAccess, type AccessItem } from "@/lib/accessSummary";
import AccessList from "@/components/access/AccessList";
import MembershipCancelControls from "@/components/account/MembershipCancelControls";
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
  const navigate = useNavigate();
  const [sub, setSub] = useState<SubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextStep, setNextStep] = useState<EnrollmentStep | null>(null);
  const [access, setAccess] = useState<AccessItem[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: subData }, { data: profData }, myAccess] = await Promise.all([
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
        loadMyAccess(user.id),
      ]);
      if (cancelled) return;
      if (subData) setSub(subData as SubData);
      setAccess(myAccess);
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


  if (loading) return null;
  if (!sub && access.length === 0) return null;

  // Storefront / course / clinic buyers have access records but no legacy
  // plan row — show what they actually hold.
  if (!sub) {
    const hasRecurringStripe = access.some((a) => a.billing_shape === "recurring" && a.source === "stripe");
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-display font-bold text-foreground">What you have</h3>
        </div>
        <AccessList items={access} />
        {nextStep && nextStep.key !== "plan" && nextStep.key !== "paygate" && (
          <div className="rounded-lg border border-banner-border bg-banner text-banner-foreground p-3 space-y-2">
            <p className="text-sm font-semibold">Next: {nextStep.label}</p>
            <Button size="sm" className="w-full" onClick={() => navigate(nextStep.route)}>
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
        <MembershipCancelControls enabled={hasRecurringStripe} />
      </div>
    );
  }

  const isPaid = sub.tier !== "wren";
  const planName = planNameSync(sub.tier);

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
          <p className="font-semibold text-foreground">{planName}</p>
        </div>
        <div>
          <span className="text-muted-foreground text-xs">Monthly Fee</span>
          <p className="font-semibold text-foreground">{isPaid ? `Paid ${sub.billing_period === "annual" ? "yearly" : "monthly"}` : "Free"}</p>
        </div>
      </div>

      {sub.current_period_end && (
        <p className="text-xs text-muted-foreground">
          Next payment due: <span className="font-medium text-foreground">
            {new Date(sub.current_period_end).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </p>
      )}

      {access.length > 0 && <AccessList items={access} />}

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



      <MembershipCancelControls enabled={isPaid} fallbackName={planName} />
    </div>
  );
}
