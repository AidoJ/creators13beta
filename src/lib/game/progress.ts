/**
 * Player progress persistence — points, types seen, ELO, streak, badges.
 *
 * Called from Play.tsx after every state mutation. We diff prev → next to
 * award points for newly placed cards and bump terminal stats on finish.
 */
import { supabase } from "@/integrations/supabase/client";
import type { MatchState, PlayerState } from "./types";
import { capitaliseTypeName } from "@/lib/creatorTypes";

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

    // End-of-game (bot matches only — ranked play is finalised server-side by
    // finalise_ranked_match). Bot games never earn Points or ELO, so the only
    // thing to persist is newly seen types, through the narrow safe RPC.
    // Win/loss counts for bot games are recorded via bump_bot_match_stats.
    if (discoveredNewType) {
      await (supabase.rpc as any)("bump_types_seen", { _types: [...nextTypes] });
    }
  } catch (e) {
    console.warn("recordProgressDiff failed", e);
  }
}
