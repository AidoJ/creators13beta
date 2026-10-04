import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import ClientFAQSection from "@/components/dashboard/ClientFAQSection";

import PlayerProfileDiscountCTA from "@/components/dashboard/PlayerProfileDiscountCTA";
import DiscountCodesCard from "@/components/dashboard/DiscountCodesCard";
import GettingStartedCard from "@/components/dashboard/GettingStartedCard";
import PracticeRungCard from "@/components/dashboard/game/PracticeRungCard";
import CreatorsSeenPrompt from "@/components/dashboard/CreatorsSeenPrompt";
import QuizStatsCard from "@/components/dashboard/QuizStatsCard";
import { Card } from "@/components/ui/card";
import { Gamepad2, Globe, ArrowRight } from "lucide-react";
import gameIcon from "@/assets/community-icons/game-icon.png.asset.json";

interface Props {
  userId: string;
  email: string | undefined;
  firstName: string | null;
  onSignOut: () => Promise<void>;
}

export default function PlayerDashboard({ userId, email, firstName, onSignOut }: Props) {
  const navigate = useNavigate();
  const [profileComplete, setProfileComplete] = useState(false);
  const [promptDismissed, setPromptDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("profile_completed_at, profiling_prompt_dismissed_at")
        .eq("user_id", userId)
        .maybeSingle();
      setProfileComplete(!!prof?.profile_completed_at);
      setPromptDismissed(!!(prof as any)?.profiling_prompt_dismissed_at);
    })();
  }, [userId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <DashboardHeader email={email} onSignOut={onSignOut} />
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-5">
        {firstName && (
          <h1 className="font-display text-2xl text-foreground">Welcome, {firstName}.</h1>
        )}
        <GettingStartedCard userId={userId} firstName={firstName} />

        {/* Section teasers — Play & Community surfaces without duplicating
            their content. Matches the paid-tier Me page for nav consistency. */}
        <div className={`grid gap-4 ${profileComplete ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate("/play")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/play"); }}
            className="cursor-pointer overflow-hidden border-secondary/60 bg-gradient-to-br from-secondary/15 via-secondary/10 to-primary/10 p-4 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-sm hover:border-secondary hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-xl border border-secondary/30 bg-secondary/20 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
              <img src={gameIcon.url} alt="" aria-hidden="true" className="icon-gold h-6 w-6 text-secondary-foreground object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base sm:text-lg font-display font-bold text-foreground leading-tight whitespace-nowrap">Let&apos;s Play</p>
              <p className="text-xs text-muted-foreground mt-1">Your game dashboard, recent matches & stats.</p>
            </div>
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Card>
          {profileComplete && (
            <Card
              role="button"
              tabIndex={0}
              onClick={() => navigate("/community/dashboard")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/community/dashboard"); }}
              className="cursor-pointer p-5 flex items-center gap-4 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
            >
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Community</p>
                <p className="text-xs text-muted-foreground">See your matches across the 13 Creator Types.</p>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </Card>
          )}
        </div>

        <CreatorsSeenPrompt userId={userId} />
        <PracticeRungCard userId={userId} />
        <QuizStatsCard userId={userId} />
        {!promptDismissed && <DiscountCodesCard userId={userId} />}


        <ClientFAQSection />
      </main>
      <PlayerProfileDiscountCTA userId={userId} />
    </div>
  );
}
