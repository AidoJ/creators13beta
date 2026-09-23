import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getRequiredEnrollmentPath, loadEnrollmentState } from "@/lib/enrollmentGate";
import FrontPage from "./FrontPage";

const Index = () => {
  const { user, loading } = useAuth();
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    // If Supabase delivered a password recovery link to the root URL (because
    // Site URL fallback kicked in), forward to /reset-password preserving the
    // hash so the recovery session can be established there.
    if (typeof window !== "undefined") {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      if (hash.includes("type=recovery") || search.includes("type=recovery")) {
        setDestination(`/reset-password${search}${hash}`);
        return;
      }
    }
    // Public front page for visitors, and for a signed-in person coming back
    // from sign-in to finish a purchase they started here (?buy=...).
    if (!user || new URLSearchParams(window.location.search).has("buy")) {
      setDestination("__front");
      return;
    }


    (async () => {
      try {
        const state = await loadEnrollmentState(user.id);
        const required = getRequiredEnrollmentPath(state);
        setDestination(required ?? "/dashboard");
      } catch (e) {
        console.error("Index routing error:", e);
        setDestination("/dashboard");
      }
    })();
  }, [user, loading]);

  if (loading || !destination) return null;
  return <Navigate to={destination} replace />;
};

export default Index;
