import logo from "@/assets/13creators-logo.png";
import { cn } from "@/lib/utils";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { loadEnrollmentState } from "@/lib/enrollmentGate";

const STEPS = ["Plan", "Signup", "Payment", "Practitioner", "Details", "Consent", "Photos", "Booking"] as const;

// Route for each step (index-aligned with STEPS above). Query string
// (tier / billing) is preserved from the current location.
const STEP_ROUTES: Record<number, string> = {
  0: "/enroll",
  1: "/auth",
  2: "/enroll/payment",
  3: "/enroll/practitioner",
  4: "/enroll/details",
  5: "/enroll/consent",
  6: "/enroll/photos",
  7: "/enroll/booking",
};

interface EnrollmentHeaderProps {
  currentStep: number; // 0-indexed
  hideSteps?: boolean;
}

export default function EnrollmentHeader({ currentStep, hideSteps = false }: EnrollmentHeaderProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const qs = location.search || "";

  // Show only the steps that apply to this person's path:
  // case-study volunteers are free (no Payment) and don't book a session;
  // paying clients book only when linked to a trainer-role practitioner.
  const urlCaseStudy = new URLSearchParams(location.search).get("case_study") === "true";
  const [path, setPath] = useState<{ caseStudy: boolean; booking: boolean }>({ caseStudy: urlCaseStudy, booking: !urlCaseStudy });
  useEffect(() => {
    if (!user) return;
    let alive = true;
    loadEnrollmentState(user.id).then((st: any) => {
      if (!alive) return;
      const caseStudy = urlCaseStudy || !!st?.isCaseStudySubject;
      setPath({ caseStudy, booking: !caseStudy && (st?.practitionerIsTrainer ?? true) });
    }).catch(() => {});
    return () => { alive = false; };
  }, [user, urlCaseStudy]);
  const visible = STEPS.map((step, i) => ({ step, i })).filter(({ i }) =>
    !(i === 2 && path.caseStudy) && !(i === 7 && !path.booking));

  const goToStep = (i: number) => {
    // Only allow navigation to earlier / completed steps.
    if (i >= currentStep) return;
    const base = STEP_ROUTES[i];
    if (!base) return;
    // Signup step doesn't take tier/billing; every other enrollment step does.
    navigate(i === 1 ? base : `${base}${qs}`);
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <a href="/" className="flex items-center gap-3">
          <img src={logo} alt="13 Creators" className="h-10" />
        </a>
        {!hideSteps && (
          <div className="hidden xl:flex items-center gap-1 text-sm text-muted-foreground min-w-0">
            {visible.map(({ step, i }, pos) => {
              const isCurrent = i === currentStep;
              const isCompleted = i < currentStep;
              const clickable = isCompleted;
              return (
                <span key={step} className="flex items-center gap-1">
                  {pos > 0 && <span className="mx-0.5 hidden sm:inline">→</span>}
                  {isCurrent ? (
                    <>
                      <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                        {pos + 1}
                      </span>
                      <span className="text-foreground font-medium hidden sm:inline">{step}</span>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => goToStep(i)}
                      className={cn(
                        "hidden sm:inline bg-transparent p-0 m-0 border-0",
                        isCompleted && "text-primary hover:underline cursor-pointer",
                        !clickable && "cursor-default opacity-70",
                      )}
                      aria-label={clickable ? `Go back to ${step}` : step}
                    >
                      {step}
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
        {!user ? (
          <Link
            to={`/auth?returnTo=${returnTo}`}
            className="ml-auto xl:ml-4 min-h-11 inline-flex items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90 px-3 sm:px-5 py-2 text-sm font-semibold transition-colors whitespace-nowrap shadow-sm"
          >
            Sign in
          </Link>
        ) : (
          <Link
            to="/dashboard"
            className="ml-auto xl:ml-4 min-h-11 inline-flex items-center justify-center rounded-full border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground px-3 sm:px-5 py-2 text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Dashboard
          </Link>
        )}
      </div>
    </header>
  );
}
