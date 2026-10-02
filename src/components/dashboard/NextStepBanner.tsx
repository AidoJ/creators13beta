import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { loadEnrollmentState } from "@/lib/enrollmentGate";
import { getNextEnrollmentStep, type EnrollmentStep } from "@/lib/enrollmentSteps";

/** Top-of-dashboard "Next:" prompt (also the photo reminder), in the banner colour. */
export default function NextStepBanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [nextStep, setNextStep] = useState<EnrollmentStep | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data: sub }, { data: prof }, s] = await Promise.all([
          supabase.from("subscriptions").select("tier").eq("user_id", user.id).maybeSingle(),
          supabase.from("profiles").select("reached_checkout_at").eq("user_id", user.id).maybeSingle(),
          loadEnrollmentState(user.id),
        ]);
        if (cancelled) return;
        const step = getNextEnrollmentStep(s, (prof as any)?.reached_checkout_at ?? null);
        if (step && !sub && (step.key === "plan" || step.key === "paygate")) return setNextStep(null);
        setNextStep(step);
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!nextStep) return null;
  return (
    <div className="rounded-lg border border-banner-border bg-banner text-banner-foreground p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold">Next: {nextStep.label}</p>
        <p className="text-xs opacity-80">Step {nextStep.index} of {nextStep.total}</p>
      </div>
      <Button size="sm" onClick={() => navigate(nextStep.route)}>
        Continue <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );
}
