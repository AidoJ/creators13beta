import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getRequiredEnrollmentPath, loadEnrollmentState } from "@/lib/enrollmentGate";

const Index = () => {
  const { user, loading } = useAuth();
  const [destination, setDestination] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setDestination("/enroll");
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
