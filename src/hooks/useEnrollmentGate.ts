import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  getRequiredEnrollmentPath,
  loadEnrollmentState,
  type EnrollmentState,
} from "@/lib/enrollmentGate";

/**
 * Enforces the canonical enrollment sequence. If the user is on a page they
 * haven't earned yet (e.g. /enroll/photos without practitioner+details+consent,
 * or /dashboard before completing enrollment), redirect to the required step.
 *
 * - Staff users (practitioner/trainer/admin) bypass entirely.
 * - On enrollment pages: redirect to required step if it differs from current.
 * - On /dashboard: redirect to required step if enrollment isn't complete.
 *
 * Returns { ready, state } — gate consumers should not render until `ready`
 * to avoid a flash of forbidden content.
 */
export function useEnrollmentGate(): { ready: boolean; state: EnrollmentState | null } {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<EnrollmentState | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // ProtectedRoute handles unauth redirects; nothing to do here.
      setReady(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const s = await loadEnrollmentState(user.id);
        if (cancelled) return;
        setState(s);

        const required = getRequiredEnrollmentPath(s);
        const current = location.pathname;

        // Staff bypass entirely.
        if (s.isStaff) {
          setReady(true);
          return;
        }

        // Enrollment is complete: kick the user out of any /enroll/* page to dashboard.
        if (required === null) {
          if (current.startsWith("/enroll")) {
            navigate("/dashboard", { replace: true });
            return;
          }
          setReady(true);
          return;
        }

        // Enrollment incomplete: if current path doesn't match required, redirect.
        // Strip query when comparing — required path includes its own query.
        const requiredPath = required.split("?")[0];
        if (current !== requiredPath) {
          navigate(required, { replace: true });
          return;
        }

        setReady(true);
      } catch (e) {
        console.error("Enrollment gate error:", e);
        setReady(true); // fail open so we don't trap users in a blank screen
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, location.pathname, navigate]);

  return { ready, state };
}
