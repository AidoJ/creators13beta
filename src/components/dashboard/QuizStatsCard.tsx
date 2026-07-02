import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Trophy, Sparkles, HelpCircle, Target } from "lucide-react";
import { CREATOR_TYPE_COLORS, CREATOR_TYPE_ORDER, type CreatorType } from "@/data/cards";

interface Stats {
  wins: number;
  bonus_points: number;
  correct: number;
  wrong: number;
  answered: number;
  accuracy: number;
  by_type: Array<{ creator_type: string; correct: number; answered: number }>;
}

interface Props {
  userId: string;
  title?: string;
}

export default function QuizStatsCard({ userId, title = "Game & Quiz stats" }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    void supabase
      .rpc("get_player_quiz_stats", { _user_id: userId })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setError(error.message);
        } else {
          setStats(data as unknown as Stats);
        }
        setLoading(false);
      });
    return () => { alive = false; };
  }, [userId]);

  // Merge by_type against canonical 13-type order (Lava→Sky), zero-filling misses.
  const byTypeMap = new Map<string, { correct: number; answered: number }>();
  (stats?.by_type ?? []).forEach(r => byTypeMap.set(r.creator_type, { correct: r.correct, answered: r.answered }));
  const rows = CREATOR_TYPE_ORDER.map((t) => {
    const r = byTypeMap.get(t) ?? { correct: 0, answered: 0 };
    const pct = r.answered > 0 ? Math.round((r.correct / r.answered) * 100) : null;
    return { type: t as CreatorType, ...r, pct };
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="text-xs text-destructive">{error}</div>
      ) : !stats ? (
        <div className="text-xs text-muted-foreground">No games played yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={<Trophy className="w-3.5 h-3.5" />} label="Wins" value={stats.wins} />
            <Stat icon={<Sparkles className="w-3.5 h-3.5 text-amber-500" />} label="Bonus points" value={stats.bonus_points} />
            <Stat icon={<HelpCircle className="w-3.5 h-3.5" />} label="Questions answered" value={stats.answered} />
            <Stat icon={<Target className="w-3.5 h-3.5" />} label="Accuracy" value={`${stats.accuracy}%`} />
          </div>

          <div className="pt-2">
            <div className="text-xs font-semibold mb-2 text-muted-foreground">Mastery by Creator Type (questions mastered of bank)</div>
            <div className="space-y-1.5">
              {rows.map((r) => {
                const color = CREATOR_TYPE_COLORS[r.type];
                return (
                  <div key={r.type} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                    <div className="w-16 flex-shrink-0 font-medium">{r.type}</div>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      {r.pct !== null && (
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${r.pct}%`, background: color }}
                        />
                      )}
                    </div>
                    <div className="w-24 text-right tabular-nums text-muted-foreground">
                      {r.pct === null ? "—" : `${r.pct}%`}
                      <span className="ml-1 text-[10px] opacity-70">({r.correct}/{r.answered})</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
        {icon}{label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
