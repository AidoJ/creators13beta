/**
 * useBeatTheClockTimer — single 1s interval that drives the per-phase
 * countdown (draw + place) AND the match-end deadline for `beat_clock`
 * games.
 *
 * Phase clock: `turnStartedAtRef` is reset by the parent on each new turn
 * AND each phase transition (so a slow draw never eats into the place
 * budget). The hook reads it via ref so rapid re-renders don't cancel the
 * tick.
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
  /** Page-owned stopwatch. The page also reads this in render to display
   *  the per-phase countdown, so ownership stays in the parent and the hook
   *  just reads + resets it. Reset on turn change AND phase change. */
  turnStartedAtRef: React.MutableRefObject<number>;
  /** Called once per second so countdown labels in the parent re-render. */
  onTick: () => void;
  /** Called when the match deadline elapses in beat_clock mode. */
  onMatchEnd: (next: MatchState) => void;
  /** Called when the caller's own per-turn (place) deadline elapses. */
  onTurnExpired: (next: MatchState) => void;
  /** Called when the caller's own per-draw deadline elapses — parent should
   *  force the engine forward (auto-draw opening 5, or skip draws). */
  onDrawExpired: () => void;
}

export function useBeatTheClockTimer({
  state,
  selfSlot,
  turnStartedAtRef,
  onTick,
  onMatchEnd,
  onTurnExpired,
  onDrawExpired,
}: Args) {
  const stateRef = useRef<MatchState | null>(null);
  const selfSlotRef = useRef<string>(selfSlot);
  const onTickRef = useRef(onTick);
  const onMatchEndRef = useRef(onMatchEnd);
  const onTurnExpiredRef = useRef(onTurnExpired);
  const onDrawExpiredRef = useRef(onDrawExpired);
  /** Guards against firing the same draw-expiry repeatedly while the
   *  server round-trip is still in flight. Reset on turn/phase change. */
  const drawFiredKeyRef = useRef<string>("");

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { selfSlotRef.current = selfSlot; }, [selfSlot]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);
  useEffect(() => { onMatchEndRef.current = onMatchEnd; }, [onMatchEnd]);
  useEffect(() => { onTurnExpiredRef.current = onTurnExpired; }, [onTurnExpired]);
  useEffect(() => { onDrawExpiredRef.current = onDrawExpired; }, [onDrawExpired]);

  // Reset per-phase stopwatch whenever the active turn OR phase changes.
  useEffect(() => {
    turnStartedAtRef.current = Date.now();
    drawFiredKeyRef.current = "";
  }, [state?.turn, state?.turnNumber, state?.phase, turnStartedAtRef]);

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
      const isMyTurn = s.players[s.turn].id === selfSlotRef.current;
      if (!isMyTurn || s.pendingDisaster) return;

      if (s.phase === "draw") {
        const drawSecs = s.gameConfig?.drawSeconds ?? 0;
        if (drawSecs <= 0) return;
        if (now - turnStartedAtRef.current < drawSecs * 1000) return;
        const key = `${s.turnNumber}:${s.turn}`;
        if (drawFiredKeyRef.current === key) return;
        drawFiredKeyRef.current = key;
        try { onDrawExpiredRef.current(); } catch {/* ignore */}
        return;
      }

      const turnSecs = s.gameConfig?.turnSeconds ?? 0;
      if (
        turnSecs > 0 &&
        s.phase === "place" &&
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
