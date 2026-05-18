import logo from "@/assets/13creators-logo.png";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const STEPS = ["Plan", "Signup", "Payment", "Practitioner", "Details", "Consent", "Photos", "Booking"] as const;

interface EnrollmentHeaderProps {
  currentStep: number; // 0-indexed
}

export default function EnrollmentHeader({ currentStep }: EnrollmentHeaderProps) {
  const { user } = useAuth();
  const location = useLocation();
  const returnTo = encodeURIComponent(location.pathname + location.search);

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <a href="/" className="flex items-center gap-3">
          <img src={logo} alt="13 Creators" className="h-10" />
        </a>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          {STEPS.map((step, i) => (
            <span key={step} className="flex items-center gap-1">
              {i > 0 && <span className="mx-0.5 hidden sm:inline">→</span>}
              {i === currentStep ? (
                <>
                  <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="text-foreground font-medium hidden sm:inline">{step}</span>
                </>
              ) : (
                <span className={cn("hidden sm:inline", i < currentStep && "text-primary")}>
                  {step}
                </span>
              )}
            </span>
          ))}
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
