import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { loadMyAccess, type AccessItem } from "@/lib/accessSummary";
import { loadEnrollmentState } from "@/lib/enrollmentGate";
import { getNextEnrollmentStep, type EnrollmentStep } from "@/lib/enrollmentSteps";

/**
 * Shown once when a buyer returns from checkout (/dashboard?purchase=success).
 * Reads the newest access record from the shared status lookup. The payment
 * confirmation can land a few seconds after the redirect, so we retry briefly.
 */
export default function PurchaseSuccessBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const active = params.get("purchase") === "success";
  const [item, setItem] = useState<AccessItem | null>(null);
  const [nextStep, setNextStep] = useState<EnrollmentStep | null>(null);
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    if (!active || !user) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 6 && !cancelled; i++) {
        const access = await loadMyAccess(user.id);
        const newest = [...access].sort(
          (a, b) => new Date(b.starts_at || 0).getTime() - new Date(a.starts_at || 0).getTime(),
        )[0];
        // Only treat as "just bought" if granted in the last 30 minutes.
        if (newest && Date.now() - new Date(newest.starts_at || 0).getTime() < 30 * 60 * 1000) {
          if (!cancelled) setItem(newest);
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      try {
        const s = await loadEnrollmentState(user.id);
        if (!cancelled) setNextStep(getNextEnrollmentStep(s));
      } catch {
        /* non-fatal */
      }
      if (!cancelled) setWaiting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user]);

  if (!active) return null;

  const dismiss = () => {
    const next = new URLSearchParams(params);
    next.delete("purchase");
    setParams(next, { replace: true });
  };

  const isCourse = item?.level_key.startsWith("prac_");
  const isRecurring = item?.billing_shape === "recurring" || item?.billing_shape === "fixed_term";

  let title = "Thank you — your payment went through";
  let body = "We're confirming your purchase. It will appear under \"What you have\" in a moment.";
  if (item) {
    title = `You now have ${item.display_name}`;
    if (isCourse) {
      body = "Your training place is confirmed. Your trainer will be in touch with your cohort and start date.";
    } else if (isRecurring) {
      title = `Welcome to the community — you now have ${item.display_name}`;
      body = "Your membership is active. Start exploring: meet other members, join events and see what people are creating. It renews monthly — manage or cancel any time from \"What you have\" below.";
    } else {
      title = `Your ${item.display_name} is paid for`;
      body = "Next you'll work with a practitioner. Choose who you'd like to profile you, add your details, then upload your photos so they can prepare for your consult.";
    }
  } else if (waiting) {
    body = "Confirming your purchase…";
  }

  const showNext = !!item && !isCourse && !isRecurring && nextStep && nextStep.key !== "plan" && nextStep.key !== "paygate";
  const showExplore = !!item && !isCourse && isRecurring;

  return (
    <div role="status" className="rounded-2xl border border-primary/30 bg-primary/5 p-5 flex gap-4">
      <CheckCircle2 className="h-6 w-6 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <p className="font-display text-lg text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
        {showExplore && (
          <Button size="sm" onClick={() => navigate("/community/dashboard")}>
            Explore the community
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
        {showNext && (
          <Button size="sm" onClick={() => navigate(nextStep!.route)}>
            Next: {nextStep!.label}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground self-start">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
