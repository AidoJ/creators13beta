import { ReactNode, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getRequiredEnrollmentPath, loadEnrollmentState } from "@/lib/enrollmentGate";
import { Leaf } from "lucide-react";

/**
 * Gate that forces signed-in users to complete the community profile wizard
 * before accessing the wrapped subtree.
 *
 * Logic:
 *   - Not signed in              → let through (ProtectedRoute handles auth)
 *   - Staff (practitioner/trainer/admin) → let through
 *   - profile_completed_at set   → let through
 *   - Enrollment funnel still has a required step (paid funnel pages) → let through
 *   - Otherwise                  → redirect to /onboarding/profile
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
      const [profileRes, state] = await Promise.all([
        supabase
          .from("profiles")
          .select("profile_completed_at")
          .eq("user_id", user.id)
          .maybeSingle(),
        loadEnrollmentState(user.id),
      ]);
      if (cancelled) return;
      const completed = !!profileRes.data?.profile_completed_at;
      // Staff bypass the wizard entirely.
      if (state.isStaff) {
        setNeedsWizard(false);
        setChecking(false);
        return;
      }
      // If the paid-funnel enrollment still has steps left, let through —
      // useEnrollmentGate on those pages will redirect appropriately.
      const required = getRequiredEnrollmentPath(state);
      const midFunnel = required !== null;
      setNeedsWizard(!completed && !midFunnel);
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
