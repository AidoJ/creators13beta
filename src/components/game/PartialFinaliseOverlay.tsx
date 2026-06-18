import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trophy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { MatchState } from "@/lib/game/types";

/** "1st" / "2nd" / "3rd" / "4th"... */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function remainingRanksText(state: MatchState): string {
  const total = state.players.length;
  const placedRanks = new Set((state.placements ?? []).map((p) => p.rank));
  const remaining: number[] = [];
  for (let r = 1; r <= total; r++) if (!placedRanks.has(r)) remaining.push(r);
  if (remaining.length === 0) return "the final result";
  if (remaining.length === 1) return ordinal(remaining[0]);
  if (remaining.length === 2) return `${ordinal(remaining[0])} and ${ordinal(remaining[1])}`;
  return remaining.slice(0, -1).map(ordinal).join(", ") + ` and ${ordinal(remaining[remaining.length - 1])}`;
}

interface Props {
  state: MatchState;
  /** The local player's player.id (from state.players[].id). */
  selfPlayerId: string | null;
}

/**
 * Item 5 — partial-finalise UI.
 *
 * Watches state.placements. When a new rank lands while the match is still
 * running (state.finished === false):
 *   - If the local player is the one who finalised → celebratory dialog.
 *   - Otherwise → a sonner toast announcing the placement.
 *
 * Once state.finished flips true, this component falls silent and
 * MatchOverDialog takes over.
 */
export function PartialFinaliseOverlay({ state, selfPlayerId }: Props) {
  const seenRef = useRef<Set<string>>(new Set());
  const [celebratePlacement, setCelebratePlacement] = useState<{
    rank: number;
    remaining: string;
  } | null>(null);

  useEffect(() => {
    const placements = state.placements ?? [];
    // Don't fire partial UI once the whole match is done — MatchOverDialog
    // will handle the final reveal for everyone.
    if (state.finished) {
      // Mark everything as seen so a fresh match later starts clean.
      for (const p of placements) seenRef.current.add(`${p.playerId}:${p.rank}`);
      return;
    }

    for (const pl of placements) {
      const key = `${pl.playerId}:${pl.rank}`;
      if (seenRef.current.has(key)) continue;
      seenRef.current.add(key);

      const player = state.players.find((p) => p.id === pl.playerId);
      const name = player?.name ?? "A player";
      const remaining = remainingRanksText(state);

      if (selfPlayerId && pl.playerId === selfPlayerId) {
        // Local player — celebratory modal.
        setCelebratePlacement({ rank: pl.rank, remaining });
      } else {
        // Spectator notice for still-playing players.
        toast(`${name} placed ${ordinal(pl.rank)}`, {
          description: `Play continues for ${remaining}.`,
          icon: <Trophy className="w-4 h-4 text-amber-500" />,
          duration: 6000,
        });
      }
    }
  }, [state, selfPlayerId]);

  if (!celebratePlacement) return null;

  const isFirst = celebratePlacement.rank === 1;

  return (
    <Dialog
      open={!!celebratePlacement}
      onOpenChange={(o) => { if (!o) setCelebratePlacement(null); }}
    >
      <DialogContent className="max-w-md p-5 gap-3">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 font-display text-2xl">
            {isFirst ? (
              <Trophy className="w-6 h-6 text-amber-400" />
            ) : (
              <Sparkles className="w-6 h-6 text-amber-400" />
            )}
            {isFirst
              ? "You completed your ecosystem — 1st place!"
              : `You placed ${ordinal(celebratePlacement.rank)}!`}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {isFirst
              ? "You're locked in at the top of the leaderboard. The match continues for the others — sit back and watch them play for the remaining places."
              : `Your placement is locked in. The match continues for ${celebratePlacement.remaining}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          Your final score and ELO will be credited when the whole match ends.
          You can still review the board — you just can't take any more turns.
        </div>

        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={() => setCelebratePlacement(null)}>
            Watch the rest
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
