import logo from "@/assets/13creators-logo.png";
import { cn } from "@/lib/utils";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

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
}

export default function EnrollmentHeader({ currentStep }: EnrollmentHeaderProps) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = encodeURIComponent(location.pathname + location.search);
  const qs = location.search || "";

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
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {STEPS.map((step, i) => {
            const isCurrent = i === currentStep;
            const isCompleted = i < currentStep;
            const clickable = isCompleted;
            return (
              <span key={step} className="flex items-center gap-1">
                {i > 0 && <span className="mx-0.5 hidden sm:inline">→</span>}
                {isCurrent ? (
                  <>
                    <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                      {i + 1}
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
        {!user ? (
          <Link
            to={`/auth?returnTo=${returnTo}`}
            className="ml-4 inline-flex items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2 text-sm font-semibold transition-colors whitespace-nowrap shadow-sm"
          >
            Sign in
          </Link>
        ) : (
          <Link
            to="/dashboard"
            className="ml-4 inline-flex items-center justify-center rounded-full border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground px-5 py-2 text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Dashboard
          </Link>
        )}
      </div>
    </header>
  );
}
