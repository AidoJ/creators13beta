import { useEffect, useState } from "react";
import { Flame, Trophy, Bot } from "lucide-react";
import type { MatchState } from "@/lib/game/types";
import { playerTotalScore } from "@/lib/game/types";
import { ecosystemSummary } from "@/lib/game/engine";
import { supabase } from "@/integrations/supabase/client";

interface PublicStats {
  elo: number;
  current_streak: number;
  longest_streak: number;
  total_bot_wins: number;
  total_bot_losses: number;
}

interface ScorePanelProps {
  state: MatchState;
  /** Aligned with state.players: real user id, or null for a bot slot. */
  playerUserIds?: (string | null)[];
}

export function ScorePanel({ state, playerUserIds }: ScorePanelProps) {
  const [stats, setStats] = useState<Record<string, PublicStats>>({});

  useEffect(() => {
    if (!playerUserIds?.length) return;
    let cancelled = false;
    (async () => {
      const ids = Array.from(new Set(playerUserIds.filter((x): x is string => !!x)));
      const results = await Promise.all(
        ids.map(async (id) => {
          const { data, error } = await supabase.rpc("get_public_player_stats", { _user_id: id });
          if (error || !data?.length) return [id, null] as const;
          const r = data[0] as any;
          return [
            id,
            {
              elo: r.elo ?? 1000,
              current_streak: r.current_streak ?? 0,
              longest_streak: r.longest_streak ?? 0,
              total_bot_wins: Number(r.total_bot_wins ?? 0),
              total_bot_losses: Number(r.total_bot_losses ?? 0),
            } as PublicStats,
          ] as const;
        }),
      );
      if (cancelled) return;
      const next: Record<string, PublicStats> = {};
      for (const [id, s] of results) if (s) next[id] = s;
      setStats(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [playerUserIds?.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-wrap items-start gap-6 px-4 py-3 border-b border-border/40 bg-card/40 backdrop-blur">
      {state.players.map((p, i) => {
        const active = i === state.turn && !state.finished;
        const sum = ecosystemSummary(p.ecosystem);
        const runningPts = playerTotalScore(p);
        const uid = playerUserIds?.[i] ?? null;
        const s = uid ? stats[uid] : null;
        const isBot = !uid && (p.id === "bot" || /bot/i.test(p.name));
        return (
          <div key={p.id} className={`flex flex-col gap-0.5 ${active ? "" : "opacity-60"}`}>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className={`text-sm uppercase tracking-wider ${active ? "text-primary font-semibold" : ""}`}>{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {sum.creators}/4 creators · {sum.animals}/12 animals
              </span>
              <span className="text-xs font-semibold text-primary">{runningPts} pts</span>
              {p.hiveShield && <span className="text-xs">🛡</span>}
            </div>
            {(s || isBot) && (
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                {isBot ? (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-border bg-card text-muted-foreground">
                    <Bot className="w-2.5 h-2.5" /> CPU opponent
                  </span>
                ) : s ? (
                  <>
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold border border-secondary/40 bg-secondary/10 text-secondary-foreground"
                      title="ELO rating"
                    >
                      <Trophy className="w-2.5 h-2.5" /> {s.elo}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-300"
                      title={`Current streak · best ${s.longest_streak}`}
                    >
                      <Flame className="w-2.5 h-2.5" /> {s.current_streak}
                      <span className="opacity-60">/ {s.longest_streak}</span>
                    </span>
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-border bg-card text-muted-foreground"
                      title="Bot games won / lost"
                    >
                      <Bot className="w-2.5 h-2.5" /> {s.total_bot_wins}W · {s.total_bot_losses}L
                    </span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        );
      })}
      <div className="ml-auto text-xs text-muted-foreground flex flex-col items-end gap-0.5">
        <span className="uppercase tracking-wider text-primary/80">
          {state.gameMode === "first_to_50"
            ? `Top Score · target ${state.gameConfig?.targetScore ?? 50} pts`
            : state.gameMode === "beat_clock"
              ? "Beat the Clock"
              : "End of Days"}
        </span>
        <span>
          Turn {state.turnNumber} · Draw {state.draw.length} · Used {state.used.length}
          {state.phase === "draw" && !state.finished && <span className="ml-2 text-primary">Pick up {2 - state.drawnThisTurn} more</span>}
          {state.phase === "place" && !state.finished && <span className="ml-2 text-primary">Play {2 - state.placedThisTurn} more</span>}
          {state.finished && (
            <span className="ml-3 font-semibold text-primary">
              Winner: {state.players.find((p) => p.id === state.winnerId)?.name ?? "—"}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
