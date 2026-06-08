import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Leaf } from "lucide-react";

/**
 * Gate that forces signed-in users to complete the community profile wizard
 * before accessing the wrapped subtree.
 *
 * Logic:
 *   - Not signed in              → let through (ProtectedRoute handles auth)
 *   - profile_completed_at set   → let through
 *   - enrollment_step is "in flight" (not NULL and not 'complete')
 *                                → let through (paid funnel finishes first)
 *   - otherwise                  → redirect to /onboarding/profile
 */
export function RequiresCompletedProfile({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [needsWizard, setNeedsWizard] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setChecking(false);
      setNeedsWizard(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("profile_completed_at, enrollment_step")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const completed = !!data?.profile_completed_at;
      const step = data?.enrollment_step ?? null;
      // "In flight" means actively past the default plan-selection step but not done.
      // The default 'plan_selected' value applies to every new profile, so excluding
      // it here is what makes the wizard gate actually fire.
      const midPaidFunnel = step !== null && step !== "complete" && step !== "plan_selected";
      setNeedsWizard(!completed && !midPaidFunnel);
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, location.pathname]);

  if (authLoading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Leaf className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (needsWizard) {
    return <Navigate to="/onboarding/profile" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export default RequiresCompletedProfile;
