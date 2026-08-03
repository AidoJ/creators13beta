/**
 * Play Dashboard — Phase 2.1 nav refactor.
 *
 * Mounted at /play. Standalone home for the game section: stats, recent
 * matches, "Start a game" CTA. Matchmaking + active game UI lives at
 * /play/new and /play/m/:matchId respectively.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import GameDashboardSection from "@/components/dashboard/game/GameDashboardSection";
import { Skeleton } from "@/components/ui/skeleton";
import BuildStamp from "@/components/game/BuildStamp";

interface Loaded {
  firstName: string | null;
  tierLabel: string;
  isPaidTier: boolean;
}

export default function PlayDashboard() {
  const { user, signOut } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [profRes, subRes] = await Promise.all([
        supabase.from("profiles").select("first_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("subscriptions").select("tier, signup_path").eq("user_id", user.id).maybeSingle(),
      ]);
      const sub = subRes.data;
      let tierLabel = "Wren";
      let isPaidTier = false;
      if (sub?.signup_path === "player") {
        tierLabel = "Player";
      } else if (sub?.tier) {
        tierLabel = sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1);
        isPaidTier = sub.tier !== "wren";
      }
      setData({
        firstName: profRes.data?.first_name ?? null,
        tierLabel,
        isPaidTier,
      });
    })();
  }, [user]);

  if (!user || !data) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader email={user?.email} onSignOut={signOut} />
        <main className="container mx-auto px-4 py-8 max-w-5xl space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <DashboardHeader email={user.email} onSignOut={signOut} />
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-5">
        <GameDashboardSection
          userId={user.id}
          firstName={data.firstName}
          tierLabel={data.tierLabel}
          isPaidTier={data.isPaidTier}
        />
        <BuildStamp
          diagnostics={{ user: user.id, tier: data.tierLabel }}
          className="pt-2 border-t border-border"
        />
      </main>
    </div>
  );
}
