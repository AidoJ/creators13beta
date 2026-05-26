import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy } from "lucide-react";
import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { glyphForType } from "@/lib/game/glyphs";
import type { MatchState, PlayerState } from "@/lib/game/types";

interface Props {
  state: MatchState;
  onPlayAgain: () => void;
}

export function MatchOverDialog({ state, onPlayAgain }: Props) {
  const navigate = useNavigate();
  const open = state.finished;
  const winner = state.players.find((p) => p.id === state.winnerId) ?? state.players[0];

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl">
            <Trophy className="w-6 h-6 text-amber-500" />
            {winner.name} wins!
          </DialogTitle>
          <DialogDescription>
            Match complete in {state.turnNumber} turns. Here's the final breakdown by Creator Type.
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          {state.players.map((p) => (
            <PlayerBreakdown key={p.id} player={p} winner={p.id === state.winnerId} />
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-end mt-4">
          <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
          <Button onClick={onPlayAgain}>Play again</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlayerBreakdown({ player, winner }: { player: PlayerState; winner: boolean }) {
  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    let creators = 0;
    let animals = 0;
    for (const pc of player.ecosystem.placed.values()) {
      const k = pc.card.kind;
      if (k === "creator" || k === "sky_creator") creators += 1;
      else animals += 1;
      for (const t of pc.card.types ?? []) {
        byType.set(t, (byType.get(t) ?? 0) + 1);
      }
    }
    const ranked = Array.from(byType.entries()).sort((a, b) => b[1] - a[1]);
    return { byType: ranked, creators, animals };
  }, [player]);

  return (
    <div
      className={`rounded-lg border p-3 ${
        winner ? "border-amber-400 bg-amber-50 dark:bg-amber-950/20" : "border-border/60"
      }`}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-semibold">{player.name}</div>
        <div className="text-xs text-muted-foreground">
          {counts.creators}/4 creators · {counts.animals}/12 animals · {player.score} pts
        </div>
      </div>
      {counts.byType.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">No cards placed.</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {counts.byType.map(([type, n]) => {
            const color = CREATOR_TYPE_COLORS[type as keyof typeof CREATOR_TYPE_COLORS] ?? "#888";
            const glyph = glyphForType(type);
            return (
              <div
                key={type}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ background: color }}
                title={`${type}: ${n}`}
              >
                {glyph && <img src={glyph} alt="" className="w-3 h-3 object-contain" />}
                <span>{type}</span>
                <span className="opacity-80">×{n}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
