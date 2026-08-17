import { useEffect, useRef, useState } from "react";
import type { DeckCard } from "@/lib/game/types";
import { HandTile } from "./cards/HandTile";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { startTouchDragGhost, updateTouchDragGhost, endTouchDragGhost } from "@/lib/touchDrag";
import logoBack from "@/assets/13creators-logo.png";

export interface PendingDraw {
  /** Stable client id for this pending draw. */
  id: string;
  /** 'deck' shows a face-down back; 'discard' shows the real card muted. */
  source: "deck" | "discard";
  /** Real card for discard draws; null for deck (unknown until server ack). */
  card: DeckCard | null;
}

interface Props {
  hand: DeckCard[];
  selectedUid?: string | null;
  onSelect: (uid: string) => void;
  onDragStart?: (uid: string) => void;
  onDragEnd?: () => void;
  disabled?: boolean;
  size?: number;
  /** Hand-card uids whose only legal action this turn is discard. Rendered
   *  muted with a tooltip explaining that discard is the only path. */
  stuckUids?: Set<string>;
  /** Touch-drag dropped onto the discard pile. Bypasses synthetic click so
   *  it doesn't depend on the discard pile's stale-closure selectedUid. */
  onTouchDropDiscard?: (uid: string) => void;
  /** Optimistic draw placeholders rendered after the real hand. */
  pending?: PendingDraw[];
  /** Fired when a card's info popup is opened (coach tracks this). */
  onCardInfoOpen?: () => void;
}



// Distance (px) the finger must travel before a press becomes a drag.
// Mirrors BoardHexPiece so behaviour is consistent across the app.
const DRAG_THRESHOLD = 16;

interface PointerTrack {
  uid: string;
  x: number;
  y: number;
  dragging: boolean;
  suppressClick: boolean;
}

export function PlayerHand({ hand, selectedUid, onSelect, onDragStart, onDragEnd, disabled, size = 104, stuckUids, onTouchDropDiscard, pending, onCardInfoOpen }: Props) {
  const coarse = useCoarsePointer();
  // Track which card uids have completed their draw-in animation.
  const revealedRef = useRef<Set<string>>(new Set());
  const [, force] = useState(0);
  // Track per-card animation phase: 'dropping' | 'flipping' | undefined (done).
  const phaseRef = useRef<Map<string, "dropping" | "flipping">>(new Map());

  // Per-card timers so we never cancel another card's in-flight animation
  // when `hand` changes (e.g. drawing 2 new cards while older ones still settle).
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());

  // Per-pointerId touch tracker. Keyed at the PlayerHand level so multi-touch
  // (e.g. an errant second finger) doesn't clobber the primary drag.
  const pointersRef = useRef<Map<number, PointerTrack>>(new Map());

  useEffect(() => {
    const newCards: string[] = [];
    for (const c of hand) {
      if (!revealedRef.current.has(c.uid) && !phaseRef.current.has(c.uid)) {
        newCards.push(c.uid);
      }
    }
    // Prune memory for cards no longer in hand
    const currentUids = new Set(hand.map((c) => c.uid));
    for (const uid of Array.from(revealedRef.current)) {
      if (!currentUids.has(uid)) revealedRef.current.delete(uid);
    }
    for (const uid of Array.from(phaseRef.current.keys())) {
      if (!currentUids.has(uid)) {
        phaseRef.current.delete(uid);
        timersRef.current.get(uid)?.forEach(clearTimeout);
        timersRef.current.delete(uid);
      }
    }

    if (newCards.length === 0) return;

    newCards.forEach((uid, idx) => {
      phaseRef.current.set(uid, "dropping");
      const stagger = idx * 140;
      const ts: ReturnType<typeof setTimeout>[] = [];
      ts.push(
        setTimeout(() => {
          phaseRef.current.set(uid, "flipping");
          force((n) => n + 1);
        }, stagger + 500),
      );
      ts.push(
        setTimeout(() => {
          phaseRef.current.delete(uid);
          revealedRef.current.add(uid);
          timersRef.current.delete(uid);
          force((n) => n + 1);
        }, stagger + 500 + 1500),
      );
      timersRef.current.set(uid, ts);
    });
    force((n) => n + 1);
    // NOTE: intentionally no cleanup that clears timers — doing so would
    // orphan cards mid-animation when `hand` updates (next draw).
  }, [hand]);

  // Clear all timers only on unmount.
  useEffect(() => {
    return () => {
      timersRef.current.forEach((ts) => ts.forEach(clearTimeout));
      timersRef.current.clear();
    };
  }, []);

  // A hand never exceeds 5 cards, so always size tiles to fit 5 across the
  // available width (never larger than the requested `size`).
  const rowRef = useRef<HTMLDivElement>(null);
  const [fitSize, setFitSize] = useState(size);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (!w) return;
      const gap = window.innerWidth >= 640 ? 12 : 8;
      const per = Math.floor((w - gap * 4) / 5);
      setFitSize(Math.max(40, Math.min(size, per)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);
  const tileSize = fitSize;

  return (
    <div
      className="shrink-0 border-t border-border/40 bg-card/40 backdrop-blur p-2 sm:p-3"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div ref={rowRef} className="flex flex-nowrap items-end gap-2 sm:gap-3 justify-start sm:justify-center overflow-x-auto overflow-y-hidden scrollbar-thin">



        {hand.map((card, idx) => {
          const selected = card.uid === selectedUid;
          const phase = phaseRef.current.get(card.uid);
          const isAnimating = phase !== undefined;
          const isDropping = phase === "dropping";
          const isFlipping = phase === "flipping";
          // Find stagger order among currently animating new cards
          const animatingUids = hand
            .filter((c) => phaseRef.current.has(c.uid))
            .map((c) => c.uid);
          const animIdx = animatingUids.indexOf(card.uid);
          const stagger = animIdx >= 0 ? animIdx * 140 : 0;

          const height = tileSize * 1.35;
          const stuck = !!stuckUids?.has(card.uid);

          return (
            <div
              key={card.uid}
              title={stuck ? "No legal placement — you can discard it to satisfy the 2-placement rule." : undefined}

              draggable={!disabled && !isAnimating && !coarse}
              onClick={(e) => {
                if (disabled || isAnimating) return;
                // If pointerup already classified this as a drag we suppress
                // the synthetic click so we don't double-fire onSelect /
                // toggle a card the user was dragging onto the board.
                const tracks = Array.from(pointersRef.current.values());
                if (tracks.some((t) => t.uid === card.uid && t.suppressClick)) {
                  return;
                }
                onSelect(card.uid);
              }}
              onPointerDown={(e) => {
                if (disabled || isAnimating) return;
                if ((e.target as HTMLElement).closest("button")) return;
                // Mouse uses native HTML5 drag-and-drop (onDragStart) when
                // available. Touch / pen always go through the pointer path.
                if (e.pointerType === "mouse" && !coarse) return;
                pointersRef.current.set(e.pointerId, {
                  uid: card.uid,
                  x: e.clientX,
                  y: e.clientY,
                  dragging: false,
                  suppressClick: false,
                });
              }}
              onPointerMove={(e) => {
                if (disabled || isAnimating) return;
                const p = pointersRef.current.get(e.pointerId);
                if (!p || p.uid !== card.uid) return;
                if (!p.dragging) {
                  const dx = e.clientX - p.x;
                  const dy = e.clientY - p.y;
                  if (dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD) {
                    p.dragging = true;
                    p.suppressClick = true;
                    onSelect(card.uid);
                    onDragStart?.(card.uid);
                    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                    startTouchDragGhost(e.currentTarget as HTMLElement, e.clientX, e.clientY);
                  }
                }
                if (p.dragging) {
                  e.preventDefault();
                  updateTouchDragGhost(e.clientX, e.clientY);
                }
              }}
              onPointerUp={(e) => {
                const p = pointersRef.current.get(e.pointerId);
                pointersRef.current.delete(e.pointerId);
                if (disabled || isAnimating) return;
                if (!p || p.uid !== card.uid) return;
                if (p.dragging) {
                  const dropTarget = document
                    .elementFromPoint(e.clientX, e.clientY)
                    ?.closest('[data-legal-drop="true"]') as HTMLElement | null;
                  endTouchDragGhost();
                  if (dropTarget?.dataset.dropZone === "discard") {
                    onTouchDropDiscard?.(p.uid);
                  } else {
                    dropTarget?.click();
                  }
                  onDragEnd?.();
                }

              }}
              onPointerCancel={(e) => {
                const p = pointersRef.current.get(e.pointerId);
                pointersRef.current.delete(e.pointerId);
                if (p?.dragging) {
                  endTouchDragGhost();
                  onDragEnd?.();
                }
              }}
              onDragStart={(e) => {
                if (disabled || isAnimating) return;
                e.dataTransfer.setData("text/plain", card.uid);
                e.dataTransfer.effectAllowed = "move";
                onSelect(card.uid);
                onDragStart?.(card.uid);
              }}
              onDragEnd={() => {
                // Native HTML5 drop already fired onPlace on the target cell
                // (or the Ecosystem container's onDrop). Do NOT synthesize a
                // click here — that produced a duplicate placement which, in
                // PvP, was serialised through the submit mutex and arrived
                // ~500ms later as a phantom "Card not in hand" / "Not your
                // turn" rejection. The pointer fallback (onPointerUp above)
                // still synthesises a click because touch never fires
                // native drop events.
                onDragEnd?.();
              }}
              className={`cursor-grab active:cursor-grabbing select-none ${stuck ? "opacity-60 saturate-50" : ""}`}
              style={{
                touchAction: "none",
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
                WebkitTapHighlightColor: "transparent",
                ...(isDropping
                  ? {
                      animation: `handDrop 500ms cubic-bezier(0.2, 0.85, 0.35, 1.1) ${stagger}ms both`,
                    }
                  : {}),
              }}

            >
              {isAnimating ? (
                <div
                  className="relative"
                  style={{ width: tileSize, height, perspective: 1200 }}
                  aria-label={card.name}
                >
                  <div
                    className="relative w-full h-full"
                    style={{
                      transformStyle: "preserve-3d",
                      transition: isFlipping ? "transform 1500ms cubic-bezier(0.4, 0.2, 0.2, 1)" : undefined,
                      transform: isFlipping ? "rotateY(180deg)" : "rotateY(0deg)",
                    }}
                  >
                    {/* Back (logo) — visible during drop, flips away during reveal */}
                    <div
                      className="absolute inset-0 rounded-2xl overflow-hidden shadow-lg border border-border/40 flex items-center justify-center"
                      style={{
                        backfaceVisibility: "hidden",
                        background:
                          "radial-gradient(circle at 30% 25%, hsl(var(--primary) / 0.35), hsl(var(--background)) 70%), hsl(var(--card))",
                      }}
                    >
                      <img
                        src={logoBack}
                        alt=""
                        className="object-contain pointer-events-none"
                        style={{ width: "78%", height: "78%" }}
                      />
                    </div>
                    {/* Front (actual card) */}
                    <div
                      className="absolute inset-0"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <HandTile
              onInfoOpen={onCardInfoOpen} card={card} size={tileSize} selected={selected} dimmed={disabled} />
                    </div>
                  </div>
                </div>
              ) : (
                <HandTile card={card} size={tileSize} selected={selected} dimmed={disabled} />
              )}
            </div>
          );
        })}
        {(pending ?? []).map((p) => {
          const height = tileSize * 1.35;
          return (
            <div
              key={p.id}
              aria-label={p.source === "deck" ? "Drawing from deck…" : `Drawing ${p.card?.name ?? "card"}…`}
              className="select-none pointer-events-none"
              style={{
                width: tileSize,
                height,
                animation: "handDrop 320ms cubic-bezier(0.2, 0.85, 0.35, 1.1) both",
              }}
            >
              {p.source === "discard" && p.card ? (
                <div className="relative w-full h-full">
                  <HandTile card={p.card} size={tileSize} selected={false} dimmed />
                  <div
                    className="absolute inset-0 rounded-2xl ring-2 ring-primary/60 pointer-events-none"
                    style={{ animation: "pendingPulse 1200ms ease-in-out infinite" }}
                  />
                </div>
              ) : (
                <div
                  className="relative w-full h-full rounded-2xl overflow-hidden shadow-lg border border-border/40 flex items-center justify-center"
                  style={{
                    background:
                      "radial-gradient(circle at 30% 25%, hsl(var(--primary) / 0.35), hsl(var(--background)) 70%), hsl(var(--card))",
                    animation: "pendingPulse 1200ms ease-in-out infinite",
                  }}
                >
                  <img
                    src={logoBack}
                    alt=""
                    className="object-contain pointer-events-none"
                    style={{ width: "78%", height: "78%" }}
                  />
                </div>
              )}
            </div>
          );
        })}
        {hand.length === 0 && (pending?.length ?? 0) === 0 && <div className="text-sm text-muted-foreground italic">No cards in hand.</div>}
      </div>
      <style>{`
        @keyframes handDrop {
          0% { transform: translateY(-220px) rotate(-8deg); opacity: 0; }
          70% { opacity: 1; }
          100% { transform: translateY(0) rotate(0deg); opacity: 1; }
        }
        @keyframes pendingPulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
