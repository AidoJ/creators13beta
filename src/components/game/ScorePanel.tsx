import type { MatchState } from "@/lib/game/types";

interface Props {
  state: MatchState;
}

export function ScorePanel({ state }: Props) {
  return (
    <div className="flex items-center gap-6 px-4 py-3 border-b border-border/40 bg-card/40 backdrop-blur">
      {state.players.map((p, i) => {
        const active = i === state.turn && !state.finished;
        return (
          <div
            key={p.id}
            className={`flex items-baseline gap-2 ${active ? "" : "opacity-60"}`}
          >
            <span
              className={`text-sm uppercase tracking-wider ${
                active ? "text-primary font-semibold" : ""
              }`}
            >
              {p.name}
            </span>
            <span
              className="text-2xl"
              style={{ fontFamily: '"Lilita One", sans-serif' }}
            >
              {p.score}
            </span>
          </div>
        );
      })}
      <div className="ml-auto text-xs text-muted-foreground">
        Turn {state.turnNumber} · Deck {state.deck.length} · Discard {state.discard.length}
        {state.finished && (
          <span className="ml-3 font-semibold text-primary">
            Match over — winner:{" "}
            {state.players.find((p) => p.id === state.winnerId)?.name ?? "—"}
          </span>
        )}
      </div>
    </div>
  );
}
