import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { loadEnrollmentState } from "@/lib/enrollmentGate";
import { getNextEnrollmentStep, stepsRemaining } from "@/lib/enrollmentSteps";

/**
 * "Continue where you left off" — renders on the dashboard and Me-page
 * whenever a signed-in, non-staff, non-player user has enrolment started
 * but incomplete. Silent for everyone else.
 *
 * Uses the SAME resolver as the enrolment gate and the recovery sweep so
 * the three surfaces can never disagree about "next step".
 */
interface Props {
  userId: string;
}

export default function ContinueEnrollmentBlock({ userId }: Props) {
  const navigate = useNavigate();
  const [step, setStep] = useState<ReturnType<typeof getNextEnrollmentStep>>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ data: prof }, state] = await Promise.all([
          supabase.from("profiles").select("reached_checkout_at").eq("user_id", userId).maybeSingle(),
          loadEnrollmentState(userId),
        ]);
        if (cancelled) return;
        setStep(getNextEnrollmentStep(state, (prof as any)?.reached_checkout_at ?? null));
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  if (!ready || !step) return null;
  // "Choose your plan" isn't a resumable state — user hasn't started.
  if (step.key === "plan") return null;

  const remaining = stepsRemaining(step);
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => navigate(step.route)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate(step.route); }}
      className="cursor-pointer p-5 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors flex items-center gap-4"
      aria-label={`Continue enrolment: ${step.label}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-1">
          Continue where you left off
        </p>
        <p className="text-sm font-semibold text-foreground">
          Next step: {step.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {remaining === 1 ? "One step to go — your progress is saved." : `${remaining} steps to go — your progress is saved.`}
        </p>
      </div>
      <ArrowRight className="h-5 w-5 text-primary flex-shrink-0" />
    </Card>
  );
}
