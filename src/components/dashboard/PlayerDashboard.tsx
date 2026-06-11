import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import ClientFAQSection from "@/components/dashboard/ClientFAQSection";

import PlayerProfileDiscountCTA from "@/components/dashboard/PlayerProfileDiscountCTA";
import { Card } from "@/components/ui/card";
import { Gamepad2, Globe, ArrowRight, Mail } from "lucide-react";

interface Props {
  userId: string;
  email: string | undefined;
  firstName: string | null;
  onSignOut: () => Promise<void>;
}

export default function PlayerDashboard({ userId, email, firstName, onSignOut }: Props) {
  const navigate = useNavigate();
  const [profileComplete, setProfileComplete] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("profile_completed_at")
        .eq("user_id", userId)
        .maybeSingle();
      setProfileComplete(!!prof?.profile_completed_at);
    })();
  }, [userId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <DashboardHeader email={email} onSignOut={onSignOut} />
      <main className="container mx-auto px-4 py-8 max-w-5xl space-y-5">
        {firstName && (
          <h1 className="font-display text-2xl text-foreground">Welcome, {firstName}.</h1>
        )}

        {/* Section teasers — Play & Community surfaces without duplicating
            their content. Matches the paid-tier Me page for nav consistency. */}
        <div className={`grid gap-4 ${profileComplete ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"}`}>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate("/play")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/play"); }}
            className="cursor-pointer p-5 flex items-center gap-4 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Gamepad2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Play</p>
              <p className="text-xs text-muted-foreground">Your game dashboard, recent matches & stats.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
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

        

        {/* Account settings */}
        <section className="pt-6 mt-4 border-t border-dashed border-border">
          <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-3">Settings</p>
          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate("/settings/contact")}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") navigate("/settings/contact"); }}
            className="cursor-pointer p-5 flex items-center gap-4 hover:border-primary/40 hover:bg-primary/5 transition-colors group"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Contact Preferences</p>
              <p className="text-xs text-muted-foreground">Who can reach you, on which channels, and what handles to share.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
          </Card>
        </section>

        <ClientFAQSection />
      </main>
      <PlayerProfileDiscountCTA userId={userId} />
    </div>
  );
}
