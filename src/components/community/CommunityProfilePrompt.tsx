import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

/**
 * Wraps Community pages. Members with access but no community profile can
 * still browse; they see a clear prompt to create one. Staff never see it.
 */
export default function CommunityProfilePrompt({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [profRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("profile_completed_at").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      const staff = (rolesRes.data || []).some((r) =>
        ["practitioner", "trainee", "trainer", "admin"].includes(r.role),
      );
      setShow(!staff && !profRes.data?.profile_completed_at);
    })();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <>
      {show && (
        <div className="bg-primary/10 border-b border-primary/30">
          <div className="container mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
            <UserPlus className="h-5 w-5 text-primary flex-none" />
            <p className="text-sm text-foreground flex-1 min-w-[12rem]">
              Create your community profile so other members can see you.
            </p>
            <Button asChild size="sm">
              <Link to="/onboarding/profile" state={{ from: location.pathname }}>
                Create my profile
              </Link>
            </Button>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
