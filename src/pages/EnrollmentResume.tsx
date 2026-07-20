import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * /enroll/resume?token=... landing.
 *
 * Consumes a single-use recovery token from the recovery email:
 *  - if the token is valid, the resume edge function returns a magic session
 *    (or a signed-in redirect target) plus the route to land on;
 *  - we set the session locally and navigate to that route.
 *
 * Click event is logged even if the token has already been consumed, so
 * we can still see the tap in the funnel — but the cap-reset rule keys on
 * real step writes (last_enrollment_activity_at), not clicks.
 */
export default function EnrollmentResume() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"working" | "expired" | "error">("working");

  useEffect(() => {
    const token = params.get("token") || "";
    if (!token) {
      setStatus("error");
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("enrollment-recovery-resume", {
          body: { token },
        });
        if (error || !data) throw error || new Error("no data");
        if (data.expired) {
          setStatus("expired");
          return;
        }
        // If the edge function returned a fresh session, install it before nav.
        if (data.session?.access_token && data.session?.refresh_token) {
          await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }
        const target = typeof data.route === "string" && data.route.startsWith("/")
          ? data.route
          : "/dashboard";
        navigate(target, { replace: true });
      } catch (e) {
        console.error("resume error", e);
        setStatus("error");
      }
    })();
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-4">
        {status === "working" && (
          <>
            <h1 className="font-display text-2xl">Picking up where you left off…</h1>
            <p className="text-sm text-muted-foreground">One moment.</p>
          </>
        )}
        {status === "expired" && (
          <>
            <h1 className="font-display text-2xl">This link has expired</h1>
            <p className="text-sm text-muted-foreground">
              Sign in and we'll take you straight to your next step.
            </p>
            <button
              onClick={() => navigate("/auth")}
              className="mt-2 inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground"
            >
              Sign in
            </button>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="font-display text-2xl">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              Please sign in and return to your dashboard.
            </p>
            <button
              onClick={() => navigate("/auth")}
              className="mt-2 inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground"
            >
              Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
