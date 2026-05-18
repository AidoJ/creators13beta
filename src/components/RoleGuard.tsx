import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface RoleGuardProps {
  allowedRoles: AppRole[];
  children: React.ReactNode;
  fallback?: string;
}

export default function RoleGuard({ allowedRoles, children, fallback = "/dashboard" }: RoleGuardProps) {
  const { user } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }

    async function check() {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);

      const roles = (data || []).map(r => r.role);
      setAllowed(allowedRoles.some(r => roles.includes(r)));
    }
    check();
  }, [user, allowedRoles]);

  if (allowed === null) return null; // loading
  if (!allowed) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
