/**
 * Player progress persistence — points, types seen, ELO, streak, badges.
 *
 * Called from Play.tsx after every state mutation. We diff prev → next to
 * award points for newly placed cards and bump terminal stats on finish.
 */
import { supabase } from "@/integrations/supabase/client";
import type { MatchState, PlayerState } from "./types";
import { capitaliseTypeName } from "@/lib/creatorTypes";
import { fetchGameSettings } from "./settings";

// Points are ONLY awarded when a game finishes, and only to the winner.
// Values are pulled from the admin-configurable game_settings row at
// match-end time, with safe fallbacks if the table is unreachable.

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
    // Uses the narrow `bump_types_seen` RPC (the broader bump_player_progress
    // is no longer EXECUTE-able by `authenticated`; ranked finalisation runs
    // server-side via finalise_ranked_match).
    if (!justFinished) {
      if (!discoveredNewType) return;
      await (supabase.rpc as any)("bump_types_seen", {
        _types: [...nextTypes],
      });
      return;
    }

    // End-of-game: winner gets full points; on a DRAW (no winnerId — e.g.
    // End of Days where neither player completed a valid ecosystem before
    // both piles emptied) every player gets HALF the win points and ELO is
    // unaffected. Values come from the admin-configurable game_settings row.
    const settings = await fetchGameSettings();
    let pointsDelta = 0;
    let won: boolean | null = null;
    let eloDelta = 0;
    if (next.winnerId === selfSlot) {
      won = true;
      pointsDelta = settings.points_per_win;
      eloDelta = settings.elo_win;
    } else if (next.winnerId) {
      won = false;
      eloDelta = settings.elo_loss;
    } else {
      // Draw — every player earns half points, ELO neutral, no win/loss recorded.
      pointsDelta = Math.floor(settings.points_per_win / 2);
    }

    const perfectEco = nextSelf.ecosystem.placed.size >= 16;
    if (perfectEco && won) pointsDelta += settings.perfect_eco_bonus;

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
