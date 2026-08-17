/**
 * useCoach — drives the coached first match.
 *
 * The coach OBSERVES; it never gates the engine. `notifyMove` is called from
 * Play.tsx's single `guarded()` move funnel after a move succeeds locally, and
 * the hook decides whether that satisfied the current lesson, satisfied a
 * later one (skip it rather than re-teach it), or is off-script (gentle
 * redirect, stay put).
 *
 * Position survives a mid-match reload via sessionStorage.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COACH_STEPS, type CoachStep, type CoachWant } from "@/lib/game/coachScript";

const POS_KEY = "creators13.coach.position.v1";
const DONE_KEY = "creators13.coach.completed.v1";

interface Args {
  enabled: boolean;
  /** Whether the coached player can currently act (their turn). */
  isMyTurn: boolean;
}

export interface CoachApi {
  active: boolean;
  step: CoachStep | null;
  index: number;
  total: number;
  /** Transient confirmation copy shown after a step completes. */
  confirmText: string | null;
  /** Transient redirect copy shown after an off-script action. */
  redirectText: string | null;
  /** True once the coach has retired and the player is flying solo. */
  retired: boolean;
  /** Element the UI should spotlight right now. */
  spotlight: CoachStep["target"] | null;
  /** Card the draw pile should be stacked with before this step. */
  want: CoachWant;
  ack: () => void;
  skipStep: () => void;
  exit: () => void;
  notifyMove: (moveType: string | undefined) => void;
  /** Re-pulse the current target without doing anything for the player. */
  showMe: () => void;
  pulseTick: number;
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

function loadCompleted(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DONE_KEY);
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function useCoach({ enabled, isMyTurn }: Args): CoachApi {
  const [index, setIndex] = useState<number>(() => (enabled ? loadPosition() : 0));
  const [exited, setExited] = useState(false);
  const [confirmText, setConfirmText] = useState<string | null>(null);
  const [redirectText, setRedirectText] = useState<string | null>(null);
  const [pulseTick, setPulseTick] = useState(0);
  const progressRef = useRef(0);
  const completedRef = useRef<Set<string>>(loadCompleted());
  const redirectAtRef = useRef(0);

  const total = COACH_STEPS.length;
  const retired = exited || index >= total;
  const active = enabled && !retired;
  const step = active ? COACH_STEPS[index] ?? null : null;

  useEffect(() => {
    if (!enabled) return;
    try {
      sessionStorage.setItem(POS_KEY, String(index));
    } catch {
      /* ignore */
    }
  }, [index, enabled]);

  const persistCompleted = useCallback(() => {
    try {
      sessionStorage.setItem(DONE_KEY, JSON.stringify(Array.from(completedRef.current)));
    } catch {
      /* ignore */
    }
  }, []);

  /** Advance past the current step, skipping anything already satisfied. */
  const advance = useCallback((from: number) => {
    let next = from + 1;
    while (next < COACH_STEPS.length && completedRef.current.has(COACH_STEPS[next].id)) {
      next += 1;
    }
    progressRef.current = 0;
    setRedirectText(null);
    setIndex(next);
  }, []);

  const completeCurrent = useCallback(
    (current: CoachStep, at: number) => {
      completedRef.current.add(current.id);
      persistCompleted();
      if (current.confirm) {
        setConfirmText(current.confirm);
        window.setTimeout(() => setConfirmText(null), 4500);
      }
      advance(at);
    },
    [advance, persistCompleted],
  );

  const notifyMove = useCallback(
    (moveType: string | undefined) => {
      if (!enabled || retired || !moveType) return;
      const current = COACH_STEPS[index];
      if (!current) return;

      // Did this satisfy a LATER lesson? Mark it so we don't re-teach it.
      for (let i = index + 1; i < COACH_STEPS.length; i++) {
        const s = COACH_STEPS[i];
        if (!s.ack && (s.count ?? 1) === 1 && s.completedBy?.includes(moveType)) {
          completedRef.current.add(s.id);
        }
      }
      persistCompleted();

      if (current.completedBy?.includes(moveType)) {
        progressRef.current += 1;
        if (progressRef.current >= (current.count ?? 1)) {
          completeCurrent(current, index);
        }
        return;
      }

      // Off-script but legal — the move already went through. Redirect gently,
      // at most once every few seconds so it never nags.
      if (!current.ack && current.redirect) {
        const now = Date.now();
        if (now - redirectAtRef.current > 4000) {
          redirectAtRef.current = now;
          setRedirectText(current.redirect);
          window.setTimeout(() => setRedirectText(null), 5000);
        }
      }
    },
    [enabled, retired, index, completeCurrent, persistCompleted],
  );

  const ack = useCallback(() => {
    const current = COACH_STEPS[index];
    if (!current) return;
    completedRef.current.add(current.id);
    persistCompleted();
    advance(index);
  }, [index, advance, persistCompleted]);

  const skipStep = useCallback(() => {
    const current = COACH_STEPS[index];
    if (current) {
      completedRef.current.add(current.id);
      persistCompleted();
    }
    advance(index);
  }, [index, advance, persistCompleted]);

  const exit = useCallback(() => {
    setExited(true);
    setIndex(COACH_STEPS.length);
    setConfirmText(null);
    setRedirectText(null);
  }, []);

  const showMe = useCallback(() => setPulseTick((t) => t + 1), []);

  // Idle nudge: if the player sits on an action step without acting, re-pulse
  // the target so they know where to look.
  useEffect(() => {
    if (!active || !step || step.ack || !isMyTurn) return;
    const id = window.setTimeout(() => setPulseTick((t) => t + 1), 20000);
    return () => window.clearTimeout(id);
  }, [active, step?.id, isMyTurn, pulseTick]);

  const spotlight = useMemo(() => {
    if (!active || !step) return null;
    if (step.scaffold === "light") return null;
    return step.target;
  }, [active, step]);

  return {
    active,
    step,
    index,
    total,
    confirmText,
    redirectText,
    retired,
    spotlight,
    want: active ? step?.want ?? null : null,
    ack,
    skipStep,
    exit,
    notifyMove,
    showMe,
    pulseTick,
  };
}

/** Clears coach progress so a fresh coached match starts at step 1. */
export function resetCoach() {
  try {
    sessionStorage.removeItem(POS_KEY);
    sessionStorage.removeItem(DONE_KEY);
  } catch {
    /* ignore */
  }
}
