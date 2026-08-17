/**
 * useCoach — drives the coached first match (v2).
 *
 * Snapshot-driven: Play.tsx rebuilds a `CoachSnapshot` every render and the
 * hook evaluates the live step's `done` predicate against the snapshot that
 * was captured when the step became live. Move events are never counted
 * directly, so a replayed or unrelated move can neither advance nor skip a
 * lesson (the old "mark later steps complete" look-ahead is gone — that was
 * what silently deleted the second-action lesson).
 *
 * The coach also enforces an ACTION ENVELOPE: `checkMove` is called BEFORE a
 * move is applied and returns a nudge string when the attempted action isn't
 * the one this step teaches. Wrong-but-legal moves are gently prevented, so
 * the board can't drift out from under the script. Free actions (rotate,
 * reposition) are always allowed.
 *
 * Rhythm: prompt → the player acts → an explicit success state that HOLDS
 * until they tap Next → the next lesson. Nothing auto-advances on a timer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COACH_STEPS,
  type CoachMoveAttempt,
  type CoachSnapshot,
  type CoachStep,
  type CoachWant,
} from "@/lib/game/coachScript";

const POS_KEY = "creators13.coach.position.v1";
const EXIT_KEY = "creators13.coach.exited.v1";

interface Args {
  enabled: boolean;
  snapshot: CoachSnapshot;
}

export interface CoachApi {
  active: boolean;
  step: CoachStep | null;
  index: number;
  total: number;
  successText: string | null;
  awaitingNext: boolean;
  redirectText: string | null;
  /** Live progress line for the current step ("1 of 2 picked up"). */
  progressText: string | null;
  retired: boolean;
  collapsed: boolean;
  spotlight: CoachStep["target"] | null;
  want: CoachWant;
  /** True while the step is waiting on the bot rather than the player. */
  watching: boolean;
  ack: () => void;
  next: () => void;
  skipStep: () => void;
  collapse: () => void;
  resume: () => void;
  restart: () => void;
  exit: () => void;
  /** Action envelope — returns a nudge when the move isn't this step's. */
  checkMove: (move: CoachMoveAttempt) => string | null;
  /** Records an out-of-engine interaction (card info, opponent view). */
  showMe: () => void;
  back: () => void;
  canGoBack: boolean;
  pulseTick: number;
  drawFirst: boolean;
}

function loadPosition(): number {
  try {
    const raw = sessionStorage.getItem(POS_KEY);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function loadExited(): boolean {
  try {
    return sessionStorage.getItem(EXIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function useCoach({ enabled, snapshot }: Args): CoachApi {
  const [index, setIndex] = useState<number>(() => (enabled ? loadPosition() : 0));
  const [exited, setExited] = useState<boolean>(() => (enabled ? loadExited() : false));
  const [collapsed, setCollapsed] = useState(false);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [redirectText, setRedirectText] = useState<string | null>(null);
  const [pulseTick, setPulseTick] = useState(0);
  const redirectAtRef = useRef(0);

  const total = COACH_STEPS.length;
  const finished = index >= total;
  const retired = exited || finished;
  const active = enabled && !retired;
  const step = active ? COACH_STEPS[index] ?? null : null;
  const awaitingNext = active && successText !== null;

  /** Snapshot captured when the current step became live. */
  const baseRef = useRef<CoachSnapshot>(snapshot);
  const baseForRef = useRef<number>(-1);
  if (baseForRef.current !== index) {
    baseForRef.current = index;
    baseRef.current = snapshot;
  }

  useEffect(() => {
    if (!enabled) return;
    try {
      sessionStorage.setItem(POS_KEY, String(index));
      sessionStorage.setItem(EXIT_KEY, exited ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [index, exited, enabled]);

  const advance = useCallback((from: number) => {
    setRedirectText(null);
    setSuccessText(null);
    setIndex(from + 1);
  }, []);

  /* Completion is evaluated from the live snapshot, not from move events. */
  useEffect(() => {
    if (!active || !step || successText !== null) return;
    if (!step.done) return;
    if (step.done(snapshot, baseRef.current)) {
      setRedirectText(null);
      setSuccessText(step.confirm || "Yes — you've got it.");
    }
  }, [active, step, snapshot, successText]);

  /**
   * ACTION ENVELOPE. Called before the engine runs. Returning a string
   * prevents the move and shows the nudge; null lets it through.
   */
  const checkMove = useCallback(
    (move: CoachMoveAttempt): string | null => {
      if (!enabled || retired || !step) return null;
      // Once the lesson is done we're just waiting on Next — don't block play.
      if (successText !== null) return null;
      if (!step.allow) return null;
      const nudge = step.allow(move, snapshot);
      if (!nudge) return null;
      const now = Date.now();
      if (now - redirectAtRef.current > 2500) {
        redirectAtRef.current = now;
        setRedirectText(nudge);
        window.setTimeout(() => setRedirectText(null), 6000);
      }
      return nudge;
    },
    [enabled, retired, step, snapshot, successText],
  );

  const ack = useCallback(() => advance(index), [index, advance]);
  const next = useCallback(() => advance(index), [advance, index]);
  const skipStep = useCallback(() => advance(index), [index, advance]);

  const collapse = useCallback(() => setCollapsed(true), []);
  const resume = useCallback(() => {
    setCollapsed(false);
    setExited(false);
    setPulseTick((t) => t + 1);
  }, []);

  const restart = useCallback(() => {
    setSuccessText(null);
    setRedirectText(null);
    setExited(false);
    setCollapsed(false);
    setIndex(0);
  }, []);

  const exit = useCallback(() => {
    setExited(true);
    setCollapsed(false);
    setSuccessText(null);
    setRedirectText(null);
  }, []);

  const [forceSpot, setForceSpot] = useState(false);
  const forceTimerRef = useRef<number | null>(null);
  const showMe = useCallback(() => {
    setPulseTick((t) => t + 1);
    setForceSpot(true);
    if (forceTimerRef.current) window.clearTimeout(forceTimerRef.current);
    forceTimerRef.current = window.setTimeout(() => setForceSpot(false), 6000);
  }, []);

  const canGoBack = active && index > 0;
  const back = useCallback(() => {
    setSuccessText(null);
    setRedirectText(null);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Idle nudge: re-pulse the target if the player sits on an action step.
  useEffect(() => {
    if (!active || collapsed || !step || step.type !== "do" || awaitingNext) return;
    if (!snapshot.isMyTurn) return;
    const id = window.setTimeout(() => setPulseTick((t) => t + 1), 25000);
    return () => window.clearTimeout(id);
  }, [active, collapsed, step?.id, step?.type, snapshot.isMyTurn, pulseTick, awaitingNext]);

  const drawFirst = !!(
    active &&
    !collapsed &&
    snapshot.isMyTurn &&
    snapshot.phase === "draw" &&
    snapshot.firstPickupDone &&
    step?.type === "do" &&
    step.target !== "deck"
  );

  const spotlight = useMemo(() => {
    if (!active || !step || collapsed) return null;
    if (awaitingNext) return null;
    if (step.scaffold === "light" && !forceSpot) return null;
    if (step.target === "none") return null;
    return step.target;
  }, [active, step, collapsed, awaitingNext, forceSpot]);

  const progressText = useMemo(() => {
    if (!active || !step || awaitingNext) return null;
    return step.progress?.(snapshot, baseRef.current) ?? null;
  }, [active, step, snapshot, awaitingNext]);

  return {
    active,
    step,
    index,
    total,
    successText,
    awaitingNext,
    redirectText,
    progressText,
    retired,
    collapsed,
    spotlight,
    want: active && !awaitingNext ? step?.want ?? null : null,
    watching: !!(active && step?.type === "watch" && !awaitingNext),
    ack,
    next,
    skipStep,
    collapse,
    resume,
    restart,
    exit,
    checkMove,
    showMe,
    back,
    canGoBack,
    pulseTick,
    drawFirst,
  };
}

/** Clears coach progress so a fresh coached match starts at step 1. */
export function resetCoach() {
  try {
    sessionStorage.removeItem(POS_KEY);
    sessionStorage.removeItem(EXIT_KEY);
    sessionStorage.removeItem("creators13.coach.completed.v1");
  } catch {
    /* ignore */
  }
}
