/**
 * Player progress persistence — points, types seen, ELO, streak, badges.
 *
 * Called from Play.tsx after every state mutation. We diff prev → next to
 * award points for newly placed cards and bump terminal stats on finish.
 */
import { supabase } from "@/integrations/supabase/client";
import type { MatchState, PlayerState } from "./types";
import { capitaliseTypeName } from "@/lib/creatorTypes";

const POINTS_PER_PLACEMENT = 5;
const POINTS_PER_NEW_TYPE = 10;
const POINTS_WIN = 50;
const POINTS_FINISH = 10;
const POINTS_PERFECT_ECO = 25;
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
    const prevSelf = selfFor(prev, selfSlot);
    const nextSelf = selfFor(next, selfSlot);
    if (!nextSelf) return;

    const prevPlaced = prevSelf?.ecosystem.placed.size ?? 0;
    const newPlaced = nextSelf.ecosystem.placed.size - prevPlaced;

    const prevTypes = typesOf(prevSelf);
    const nextTypes = typesOf(nextSelf);
    const brandNewTypes = [...nextTypes].filter((t) => !prevTypes.has(t));

    let pointsDelta = 0;
    if (newPlaced > 0) pointsDelta += newPlaced * POINTS_PER_PLACEMENT;
    pointsDelta += brandNewTypes.length * POINTS_PER_NEW_TYPE;

    let won: boolean | null = null;
    let eloDelta = 0;
    let perfectEco = false;
    const justFinished = next.finished && !alreadyFinishedBefore;
    if (justFinished) {
      // winnerId is "host" / "guest" / "you" / "bot" — caller is self if winnerId === selfSlot
      if (next.winnerId === selfSlot) {
        won = true;
        pointsDelta += POINTS_WIN + POINTS_FINISH;
        eloDelta = ELO_WIN;
      } else if (next.winnerId) {
        won = false;
        pointsDelta += POINTS_FINISH;
        eloDelta = ELO_LOSS;
      } else {
        // tie
        pointsDelta += POINTS_FINISH;
      }
      if (nextSelf.ecosystem.placed.size >= 16) {
        perfectEco = true;
        pointsDelta += POINTS_PERFECT_ECO;
      }
    }

    if (pointsDelta === 0 && brandNewTypes.length === 0 && !justFinished) return;

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
