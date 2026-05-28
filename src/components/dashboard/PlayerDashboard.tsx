import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import ClientFAQSection from "@/components/dashboard/ClientFAQSection";
import DiscordLinkCard from "@/components/dashboard/DiscordLinkCard";
import GameDashboardSection from "@/components/dashboard/game/GameDashboardSection";

interface Props {
  userId: string;
  email: string | undefined;
  firstName: string | null;
  onSignOut: () => Promise<void>;
}

export default function PlayerDashboard({ userId, email, firstName, onSignOut }: Props) {
  const [tierLabel, setTierLabel] = useState<string>("Player");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("tier, signup_path")
        .eq("user_id", userId)
        .maybeSingle();
      if (data?.signup_path === "player") setTierLabel("Player");
      else if (data?.tier) setTierLabel(data.tier.charAt(0).toUpperCase() + data.tier.slice(1));
    })();
  }, [userId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <DashboardHeader email={email} onSignOut={onSignOut} />
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-5">
        <GameDashboardSection
          userId={userId}
          firstName={firstName}
          tierLabel={tierLabel}
          isPaidTier={false}
        />
        <DiscordLinkCard userId={userId} />
        <ClientFAQSection />
      </main>
    </div>
  );
}
