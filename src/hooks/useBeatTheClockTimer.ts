/**
 * useBeatTheClockTimer — single 1s interval that drives both the per-turn
 * countdown AND the match-end deadline for `beat_clock` games.
 *
 * The interval is mounted ONCE per session (empty dep array) and reads the
 * latest state + self slot from refs so rapid re-renders don't cancel the
 * tick — the old inline implementation suffered exactly that bug, which
 * caused the match deadline to never fire.
 *
 * Extracted from Play.tsx. The hook does not call setState itself; it
 * invokes the parent's callbacks with the computed next state so the parent
 * remains in charge of optimistic update + server persist.
 */

import { useEffect, useRef } from "react";
import { endTurnEarly, finaliseByScore } from "@/lib/game";
import type { MatchState } from "@/lib/game/types";

interface Args {
  state: MatchState | null;
  selfSlot: string;
  /** Called once per second so countdown labels in the parent re-render. */
  onTick: () => void;
  /** Called when the match deadline elapses in beat_clock mode. */
  onMatchEnd: (next: MatchState) => void;
  /** Called when the caller's own per-turn deadline elapses. */
  onTurnExpired: (next: MatchState) => void;
}

export function useBeatTheClockTimer({
  state,
  selfSlot,
  onTick,
  onMatchEnd,
  onTurnExpired,
}: Args) {
  const stateRef = useRef<MatchState | null>(null);
  const selfSlotRef = useRef<string>(selfSlot);
  const turnStartedAtRef = useRef<number>(Date.now());
  const onTickRef = useRef(onTick);
  const onMatchEndRef = useRef(onMatchEnd);
  const onTurnExpiredRef = useRef(onTurnExpired);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { selfSlotRef.current = selfSlot; }, [selfSlot]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);
  useEffect(() => { onMatchEndRef.current = onMatchEnd; }, [onMatchEnd]);
  useEffect(() => { onTurnExpiredRef.current = onTurnExpired; }, [onTurnExpired]);

  // Reset per-turn stopwatch whenever the active turn changes.
  useEffect(() => {
    turnStartedAtRef.current = Date.now();
  }, [state?.turn, state?.turnNumber]);

  useEffect(() => {
    const id = setInterval(() => {
      onTickRef.current();
      const s = stateRef.current;
      if (!s || s.finished) return;
      if (s.gameMode !== "beat_clock") return;
      const now = Date.now();
      const endsAt = s.gameConfig?.matchEndsAt ?? 0;
      if (endsAt && now >= endsAt) {
        try {
          const next = finaliseByScore(s);
          onMatchEndRef.current(next);
        } catch {/* ignore */}
        return;
      }
      const turnSecs = s.gameConfig?.turnSeconds ?? 0;
      if (
        turnSecs > 0 &&
        s.phase === "place" &&
        !s.pendingDisaster &&
        s.players[s.turn].id === selfSlotRef.current &&
        now - turnStartedAtRef.current >= turnSecs * 1000
      ) {
        try {
          const next = endTurnEarly(s);
          onTurnExpiredRef.current(next);
        } catch {/* ignore */}
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);
}
