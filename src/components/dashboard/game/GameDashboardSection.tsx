import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Gamepad2, Flame, Trophy, Sparkles, Users, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CREATOR_TYPE_NAMES, getCreatorTypeColor } from "@/lib/creatorTypes";
import { CREATOR_TYPE_GLYPHS } from "@/lib/game/glyphs";
import { inviteUrl } from "@/lib/game/persistence";

interface ProgressRow {
  points: number;
  types_seen: string[];
  elo: number;
  current_streak: number;
  longest_streak: number;
  perfect_ecosystems: number;
  badges: string[];
  last_played_at: string | null;
}

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
  created_at: string;
}

interface Props {
  userId: string;
  firstName: string | null;
  tierLabel: string; // "Player" | "Wren" | "Robin" ...
  isPaidTier: boolean;
}

const UNLOCKS: { label: string; goal: number }[] = [
  { label: "Unlock DMs", goal: 25 },
  { label: "Unlock 2v2 trial", goal: 50 },
  { label: "Type discovery teaser", goal: 250 },
  { label: "25% off Robin upgrade", goal: 100 },
];

function timeAgo(ts: string | null): string {
  if (!ts) return "never";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function GameDashboardSection({ userId, firstName, tierLabel, isPaidTier }: Props) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<ProgressRow | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [progRes, matchRes] = await Promise.all([
        supabase
          .from("player_progress")
          .select("points, types_seen, elo, current_streak, longest_streak, perfect_ecosystems, badges, last_played_at")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("game_matches")
          .select("id, mode, status, host_user_id, guest_user_id, host_name, guest_name, winner_user_id, invite_token, updated_at, created_at")
          .or(`host_user_id.eq.${userId},guest_user_id.eq.${userId}`)
          .order("updated_at", { ascending: false })
          .limit(30),
      ]);
      if (cancelled) return;
      setProgress(
        (progRes.data as ProgressRow) ?? {
          points: 0, types_seen: [], elo: 1000,
          current_streak: 0, longest_streak: 0, perfect_ecosystems: 0,
          badges: [], last_played_at: null,
        },
      );
      setMatches((matchRes.data || []) as MatchRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const finished = useMemo(() => matches.filter(m => m.status === "finished" || m.winner_user_id), [matches]);
  const wins = finished.filter(m => m.winner_user_id === userId).length;
  const winRate = finished.length ? Math.round((wins / finished.length) * 100) : 0;
  const activeGames = useMemo(
    () => matches.filter(m => m.status === "active" && !m.winner_user_id),
    [matches],
  );
  const openInvites = useMemo(
    () => matches.filter(m => m.status === "waiting" && m.host_user_id === userId),
    [matches],
  );

  const seenSet = useMemo(() => {
    const s = new Set<string>();
    progress?.types_seen?.forEach(t => s.add(t.toLowerCase()));
    return s;
  }, [progress]);

  const displayName = firstName || "Player";

  const copyInvite = async (token: string) => {
    await navigator.clipboard.writeText(inviteUrl(token));
    toast.success("Invite link copied");
  };

  const cancelInvite = async (id: string) => {
    const { error } = await supabase.from("game_matches").delete().eq("id", id);
    if (error) { toast.error("Could not cancel"); return; }
    setMatches(m => m.filter(x => x.id !== id));
    toast.success("Invite cancelled");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const points = progress?.points ?? 0;

  return (
    <div className="space-y-5">
      {/* HERO */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/95 to-secondary/10 p-6 sm:p-8 shadow-md">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-primary font-semibold mb-1">{tierLabel}</p>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-foreground leading-tight">
              Welcome back, {displayName} — build your <span className="text-primary">hue-man</span> ecosystem.
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Match Creator Types, outplay disasters, and meet real humans.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-primary/30 bg-primary/10 text-primary">
                {tierLabel}
              </span>
              {progress && progress.current_streak > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-orange-500/30 bg-orange-500/10 text-orange-600">
                  <Flame className="h-3 w-3" /> {progress.current_streak}-streak
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-border bg-card text-muted-foreground">
                Last played {timeAgo(progress?.last_played_at ?? null)}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-secondary/40 bg-secondary/10 text-secondary-foreground">
                ELO {progress?.elo ?? 1000}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-start md:items-end gap-2">
            <div className="flex gap-2">
              <Button
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/25"
                onClick={() => navigate("/play")}
              >
                <Gamepad2 className="mr-2 h-5 w-5" /> Play now
              </Button>
              <Button variant="outline" onClick={() => navigate("/play?invite=1")}>
                <Users className="mr-2 h-4 w-4" /> Invite a friend
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {activeGames.length} active game{activeGames.length === 1 ? "" : "s"} · {openInvites.length} open invite{openInvites.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {/* ROW 1 — Points / Types seen / Match stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Points */}
        <Card className="p-5">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Points</h3>
          <div className="font-display text-4xl text-primary leading-none">{points}</div>
          <p className="text-xs text-muted-foreground mt-1">Earn by playing &amp; meeting new types</p>
          <div className="mt-4 space-y-3">
            {UNLOCKS.map(u => {
              const done = points >= u.goal;
              const pct = Math.min(100, Math.round((points / u.goal) * 100));
              return (
                <div key={u.label}>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{u.label}</span>
                    <span className={done ? "text-green-700 font-semibold" : "text-muted-foreground"}>
                      {done ? `unlocked ✓` : `${points} / ${u.goal}`}
                    </span>
                  </div>
                  <div className="h-1.5 mt-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-secondary to-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Types seen */}
        <Card className="p-5">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Types seen</h3>
          <div className="font-display text-4xl text-primary leading-none">
            {seenSet.size}
            <span className="text-muted-foreground text-xl"> / 13</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Hover a glyph to see the type</p>
          <div className="grid grid-cols-7 gap-1.5 mt-4">
            {CREATOR_TYPE_NAMES.map(name => {
              const seen = seenSet.has(name.toLowerCase());
              const color = getCreatorTypeColor(name);
              const glyph = CREATOR_TYPE_GLYPHS[name];
              return (
                <div
                  key={name}
                  title={`${name}${seen ? "" : " — not yet seen"}`}
                  className={`aspect-square rounded-md border-2 flex items-center justify-center overflow-hidden transition-transform hover:scale-110 ${
                    seen ? "shadow-md" : "opacity-30 grayscale"
                  }`}
                  style={{
                    background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                    borderColor: seen ? color : "hsl(var(--border))",
                  }}
                >
                  {glyph ? (
                    <img src={glyph} alt={name} className="w-3/4 h-3/4 object-contain" />
                  ) : (
                    <span className="font-display text-xs text-white drop-shadow">{name.slice(0, 2)}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-3 text-[11px] text-muted-foreground">
            <span>Lava → Sky</span>
            <span>{13 - seenSet.size} left</span>
          </div>
        </Card>

        {/* Match stats */}
        <Card className="p-5">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2">Match stats</h3>
          <div className="space-y-1.5 text-sm">
            <Row label="Games" value={finished.length} />
            <Row label="Wins" value={`${wins} (${winRate}%)`} />
            <Row label="Win streak" value={progress?.current_streak ?? 0} />
            <Row label="Perfect ecosystems" value={progress?.perfect_ecosystems ?? 0} />
            <Row label="ELO" value={progress?.elo ?? 1000} />
          </div>
          {!!progress?.badges?.length && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {progress.badges.map(b => (
                <span key={b} className="px-2 py-0.5 rounded-full text-[11px] font-semibold border border-secondary/40 bg-secondary/10 text-secondary-foreground">
                  {b}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ROW 2 — Active games */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">
            Active games ({activeGames.length + openInvites.length})
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/play")}>
              <Gamepad2 className="h-3.5 w-3.5 mr-1" /> New game
            </Button>
          </div>
        </div>
        {activeGames.length + openInvites.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            No active games. Hit Play to start one.
          </p>
        ) : (
          <div className="space-y-2">
            {activeGames.map(m => {
              const youHosted = m.host_user_id === userId;
              const opponent = youHosted ? (m.guest_name || "Guest") : m.host_name;
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm">
                  <div>
                    <strong className="text-foreground">vs {opponent}</strong>
                    <span className="text-muted-foreground"> · started {timeAgo(m.created_at)}</span>
                  </div>
                  <Button size="sm" onClick={() => navigate(`/play/m/${m.id}`)}>
                    Resume →
                  </Button>
                </div>
              );
            })}
            {openInvites.map(m => (
              <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card/50 px-3 py-2 text-sm">
                <div>
                  <strong className="text-foreground">Waiting for opponent</strong>
                  <span className="text-muted-foreground"> · invite link · {timeAgo(m.created_at)}</span>
                </div>
                <div className="flex gap-1.5">
                  {m.invite_token && (
                    <Button size="sm" variant="outline" onClick={() => copyInvite(m.invite_token!)}>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy link
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => cancelInvite(m.id)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ROW 3 — Recent matches */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-primary" />
          <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold">Recent matches</h3>
        </div>
        {finished.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No completed matches yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {finished.slice(0, 8).map(m => {
              const youHosted = m.host_user_id === userId;
              const opponent = youHosted ? (m.guest_name || "Bot") : m.host_name;
              const youWon = m.winner_user_id === userId;
              const tie = !m.winner_user_id;
              return (
                <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-foreground">
                    vs {opponent}
                    <span className="text-muted-foreground"> · {new Date(m.updated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                  </span>
                  <span className={
                    "px-2 py-0.5 rounded-full text-[11px] font-bold " +
                    (tie ? "bg-muted text-muted-foreground"
                      : youWon ? "bg-green-500/15 text-green-700"
                      : "bg-primary/15 text-primary")
                  }>
                    {tie ? "TIE" : youWon ? "WON" : "LOST"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* UPSELL — only for free/Wren */}
      {!isPaidTier && (
        <div className="relative overflow-hidden rounded-2xl border border-secondary/30 bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 p-5 shadow-md">
          <div className="flex items-center gap-4 flex-wrap justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-secondary/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-secondary" />
              </div>
              <div>
                <h3 className="text-base font-display font-bold text-foreground">
                  Curious what your Creator Type actually is?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Unlock face + body profiling with a certified practitioner.
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate("/enroll?upgrade=true")}>
              Explore profiling →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between py-1 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-foreground">{value}</strong>
    </div>
  );
}
