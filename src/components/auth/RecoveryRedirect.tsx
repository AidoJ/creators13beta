import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Catches Supabase password-recovery deep-links no matter which path the email
 * link landed on (Site URL fallback can drop the user on "/" or "/enroll").
 * Forwards to /reset-password preserving the hash so the recovery session can
 * be consumed there. Also listens for the PASSWORD_RECOVERY auth event in case
 * the Supabase client consumes the URL before this mounts.
 */
export default function RecoveryRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/reset-password") return;
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    if (hash.includes("type=recovery") || search.includes("type=recovery")) {
      navigate(`/reset-password${search}${hash}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && window.location.pathname !== "/reset-password") {
        navigate("/reset-password", { replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return null;
}
