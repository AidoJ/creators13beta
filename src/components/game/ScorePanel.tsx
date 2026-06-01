import type { MatchState } from "@/lib/game/types";
import { ecosystemSummary } from "@/lib/game/engine";

const POINTS_PER_PLACED_CARD = 2;

export function ScorePanel({ state }: { state: MatchState }) {
  return (
    <div className="flex flex-wrap items-center gap-6 px-4 py-3 border-b border-border/40 bg-card/40 backdrop-blur">
      {state.players.map((p, i) => {
        const active = i === state.turn && !state.finished;
        const sum = ecosystemSummary(p.ecosystem);
        const runningPts = p.ecosystem.placed.size * POINTS_PER_PLACED_CARD;
        return (
          <div key={p.id} className={`flex flex-col ${active ? "" : "opacity-60"}`}>
            <div className="flex items-baseline gap-2">
              <span className={`text-sm uppercase tracking-wider ${active ? "text-primary font-semibold" : ""}`}>{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {sum.creators}/4 creators · {sum.animals}/12 animals
              </span>
              <span className="text-xs font-semibold text-primary">{runningPts} pts</span>
              {p.hiveShield && <span className="text-xs">🛡</span>}
            </div>
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
