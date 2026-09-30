import { ReactNode, createContext, useContext, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { useFeatures } from "@/hooks/useFeatures";

/** The banner is handed to DashboardHeader, which renders it directly
 *  BELOW the top menu so it pushes content down and never covers the nav. */
const ProfilePromptBannerContext = createContext<ReactNode>(null);
export function useProfilePromptBanner() { return useContext(ProfilePromptBannerContext); }

/**
 * Wraps Community pages. Members with access but no community profile can
 * still browse; they see a clear prompt to create one. Staff never see it.
 */
export default function CommunityProfilePrompt({ children, requireCommunityAccess = false }: { children: ReactNode; requireCommunityAccess?: boolean }) {
  const { user } = useAuth();
  const { features, ready } = useFeatures();
  const hasCommunity = [...features].some((f) => f.startsWith("community_"));
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

  const banner = show && (!requireCommunityAccess || (ready && hasCommunity)) ? (
    <div className="bg-banner text-banner-foreground border-b border-banner-border">
      <div className="container mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <UserPlus className="h-5 w-5 flex-none" />
        <p className="text-sm text-banner-foreground flex-1 min-w-[12rem]">
          Create your community profile so other members can see you.
        </p>
        <Button asChild size="sm">
          <Link to="/onboarding/profile" state={{ from: location.pathname }}>
            Create my profile
          </Link>
        </Button>
      </div>
    </div>
  ) : null;

  return <ProfilePromptBannerContext.Provider value={banner}>{children}</ProfilePromptBannerContext.Provider>;
}
