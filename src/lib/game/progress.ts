/**
 * Player progress persistence — points, types seen, ELO, streak, badges.
 *
 * Called from Play.tsx after every state mutation. We diff prev → next to
 * award points for newly placed cards and bump terminal stats on finish.
 */
import { supabase } from "@/integrations/supabase/client";
import type { MatchState, PlayerState } from "./types";
import { capitaliseTypeName } from "@/lib/creatorTypes";

// Points are ONLY awarded when a game finishes, and only to the winner:
// +3 pts per game won. Mid-game we just sync which Creator Types the player
// has discovered so the dashboard grid lights up.
const POINTS_WIN = 3;
const ELO_WIN = 20;
const ELO_LOSS = -15;

function selfFor(state: MatchState | null, selfSlot: string): PlayerState | undefined {
  return state?.players.find((p) => p.id === selfSlot);
}

function typesOf(player: PlayerState | undefined): Set<string> {
  const out = new Set<string>();
  if (!player) return out;
  player.ecosystem.placed.forEach((pc) => {
    pc.card.types?.forEach((t) => out.add(capitaliseTypeName(t)));
    if (pc.card.displayType) out.add(capitaliseTypeName(pc.card.displayType));
  });
  return out;
}

/** Diff prev → next and persist any deltas for this user. Best-effort, never throws. */
export async function recordProgressDiff(args: {
  userId: string;
  selfSlot: string;
  prev: MatchState | null;
  next: MatchState;
  alreadyFinishedBefore: boolean;
}): Promise<void> {
  const { userId, selfSlot, prev, next, alreadyFinishedBefore } = args;
  try {
    const nextSelf = selfFor(next, selfSlot);
    if (!nextSelf) return;

    const prevTypes = typesOf(selfFor(prev, selfSlot));
    const nextTypes = typesOf(nextSelf);
    const discoveredNewType = [...nextTypes].some((t) => !prevTypes.has(t));

    const justFinished = next.finished && !alreadyFinishedBefore;

    // Mid-game: only sync newly-discovered types into types_seen. No points.
    if (!justFinished) {
      if (!discoveredNewType) return;
      await supabase.rpc("bump_player_progress", {
        _user_id: userId,
        _points_delta: 0,
        _types_seen: [...nextTypes],
        _won: null,
        _perfect_eco: false,
        _elo_delta: 0,
      });
      return;
    }

    // End-of-game: only the winner gets points (+3 per win). No cumulative
    // per-card bonuses — the dashboard "points" stat is now a clean wins×3 tally.
    let pointsDelta = 0;
    let won: boolean | null = null;
    let eloDelta = 0;
    if (next.winnerId === selfSlot) {
      won = true;
      pointsDelta = POINTS_WIN;
      eloDelta = ELO_WIN;
    } else if (next.winnerId) {
      won = false;
      eloDelta = ELO_LOSS;
    }

    const perfectEco = nextSelf.ecosystem.placed.size >= 16;

    await supabase.rpc("bump_player_progress", {
      _user_id: userId,
      _points_delta: pointsDelta,
      _types_seen: [...nextTypes],
      _won: won,
      _perfect_eco: perfectEco,
      _elo_delta: eloDelta,
    });
  } catch (e) {
    console.warn("recordProgressDiff failed", e);
  }
}
