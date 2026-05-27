import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Gamepad2, Sparkles, Trophy, Users, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import ClientFAQSection from "@/components/dashboard/ClientFAQSection";
import DiscordLinkCard from "@/components/dashboard/DiscordLinkCard";
import { inviteUrl } from "@/lib/game/persistence";

interface MatchRow {
  id: string;
  mode: string;
  status: string;
  host_user_id: string;
  guest_user_id: string | null;
  host_name: string;
  guest_name: string | null;
  winner_user_id: string | null;
  invite_token: string | null;
  updated_at: string;
}

interface Props {
  userId: string;
  email: string | undefined;
  firstName: string | null;
  onSignOut: () => Promise<void>;
}

export default function PlayerDashboard({ userId, email, firstName, onSignOut }: Props) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("game_matches")
        .select("id, mode, status, host_user_id, guest_user_id, host_name, guest_name, winner_user_id, invite_token, updated_at")
        .or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`)
        .order("updated_at", { ascending: false })
        .limit(30);
      if (!cancelled) {
        setMatches((data || []) as MatchRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const finished = matches.filter(m => m.status === "complete" || m.winner_user_id);
  const activeInvites = matches.filter(m => m.status === "waiting" && m.host_user_id === userId);
  const wins = finished.filter(m => m.winner_user_id === userId).length;
  const losses = finished.length - wins;
  const winRate = finished.length ? Math.round((wins / finished.length) * 100) : 0;

  const displayName = firstName || email?.split("@")[0] || "Player";

  const copyInvite = async (token: string) => {
    await navigator.clipboard.writeText(inviteUrl(token));
    toast.success("Invite link copied");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <DashboardHeader email={email} onSignOut={onSignOut} />

      <main className="container mx-auto px-4 py-8 max-w-4xl space-y-5">
        {/* Welcome */}
        <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card/90 to-secondary/10 p-6 shadow-md">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-1">Player</p>
              <h1 className="text-2xl font-display font-bold text-foreground">Welcome back, {displayName}</h1>
              <p className="text-sm text-muted-foreground mt-1">Build the ecosystem, match Creator Types, and outplay disasters.</p>
            </div>
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/25"
              onClick={() => navigate("/play")}
            >
              <Gamepad2 className="mr-2 h-5 w-5" />
              Play Now
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Matches</div>
            <div className="text-2xl font-display font-bold text-foreground">{finished.length}</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Wins</div>
            <div className="text-2xl font-display font-bold text-foreground">{wins}</div>
          </Card>
          <Card className="p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Win rate</div>
            <div className="text-2xl font-display font-bold text-foreground">{winRate}%</div>
          </Card>
        </div>

        {/* Active invites */}
        {activeInvites.length > 0 && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" />
              <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Open invites</h2>
            </div>
            <div className="space-y-2">
              {activeInvites.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2">
                  <div className="text-sm text-foreground">Waiting for a friend to join…</div>
                  <div className="flex gap-2">
                    {m.invite_token && (
                      <Button size="sm" variant="outline" onClick={() => copyInvite(m.invite_token!)}>
                        <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                      </Button>
                    )}
                    <Button size="sm" onClick={() => navigate(`/play/m/${m.id}`)}>Open</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Match history */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="h-4 w-4 text-primary" />
            <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">Match history</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : finished.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No completed matches yet. Hit Play to start your first one.</p>
          ) : (
            <div className="space-y-2">
              {finished.slice(0, 10).map(m => {
                const youHosted = m.host_user_id === userId;
                const opponent = youHosted ? (m.guest_name || "Guest") : m.host_name;
                const youWon = m.winner_user_id === userId;
                const tie = !m.winner_user_id;
                return (
                  <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-foreground truncate">vs {opponent}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(m.updated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <span className={
                      tie ? "text-xs font-semibold text-muted-foreground"
                      : youWon ? "text-xs font-semibold text-green-600"
                      : "text-xs font-semibold text-destructive"
                    }>
                      {tie ? "Tie" : youWon ? "Won" : "Lost"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Upsell */}
        <div className="relative overflow-hidden rounded-2xl border border-secondary/30 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 p-5 shadow-md">
          <div className="flex items-center gap-4 flex-wrap justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-secondary" />
              </div>
              <div>
                <h3 className="text-base font-display font-bold text-foreground">Curious what your Creator Type is?</h3>
                <p className="text-xs text-muted-foreground">Unlock profiling with a certified practitioner.</p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate("/enroll?upgrade=true")}>
              Explore profiling
            </Button>
          </div>
        </div>

        <DiscordLinkCard userId={userId} />
        <ClientFAQSection />
      </main>
    </div>
  );
}
