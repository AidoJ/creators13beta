import { useEffect, useRef, useState } from "react";
import type { DeckCard } from "@/lib/game/types";
import { HandTile } from "./cards/HandTile";
import logoBack from "@/assets/13creators-logo.png";

interface Props {
  hand: DeckCard[];
  selectedUid?: string | null;
  onSelect: (uid: string) => void;
  onDragStart?: (uid: string) => void;
  onDragEnd?: () => void;
  disabled?: boolean;
  size?: number;
}

export function PlayerHand({ hand, selectedUid, onSelect, onDragStart, onDragEnd, disabled, size = 104 }: Props) {
  // Track which card uids have completed their draw-in animation.
  const revealedRef = useRef<Set<string>>(new Set());
  const [, force] = useState(0);
  // Track per-card animation phase: 'dropping' | 'flipping' | undefined (done).
  const phaseRef = useRef<Map<string, "dropping" | "flipping">>(new Map());

  // Per-card timers so we never cancel another card's in-flight animation
  // when `hand` changes (e.g. drawing 2 new cards while older ones still settle).
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>[]>>(new Map());

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


  return (
    <div className="border-t border-border/40 bg-card/40 backdrop-blur p-3">
      <div className="flex flex-wrap items-end gap-3 justify-center">
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

          const height = size * 1.35;

          return (
            <div
              key={card.uid}
              draggable={!disabled && !isAnimating}
              onClick={() => !disabled && !isAnimating && onSelect(card.uid)}
              onPointerDown={(e) => {
                if (disabled || isAnimating) return;
                if ((e.target as HTMLElement).closest("button")) return;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                onSelect(card.uid);
              }}
              onPointerUp={(e) => {
                if (disabled || isAnimating) return;
                const dropTarget = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest('[data-legal-drop="true"]') as HTMLElement | null;
                dropTarget?.click();
              }}
              onDragStart={(e) => {
                if (disabled || isAnimating) return;
                e.dataTransfer.setData("text/plain", card.uid);
                e.dataTransfer.effectAllowed = "move";
                onSelect(card.uid);
                onDragStart?.(card.uid);
              }}
              onDragEnd={(e) => {
                const dropTarget = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest('[data-legal-drop="true"]') as HTMLElement | null;
                dropTarget?.click();
                onDragEnd?.();
              }}
              className="cursor-grab active:cursor-grabbing"
              style={
                isDropping
                  ? {
                      animation: `handDrop 500ms cubic-bezier(0.2, 0.85, 0.35, 1.1) ${stagger}ms both`,
                    }
                  : undefined
              }
            >
              {isAnimating ? (
                <div
                  className="relative"
                  style={{ width: size, height, perspective: 1200 }}
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
                      <HandTile card={card} size={size} selected={selected} dimmed={disabled} />
                    </div>
                  </div>
                </div>
              ) : (
                <HandTile card={card} size={size} selected={selected} dimmed={disabled} />
              )}
            </div>
          );
        })}
        {hand.length === 0 && <div className="text-sm text-muted-foreground italic">No cards in hand.</div>}
      </div>
      <style>{`
        @keyframes handDrop {
          0% { transform: translateY(-220px) rotate(-8deg); opacity: 0; }
          70% { opacity: 1; }
          100% { transform: translateY(0) rotate(0deg); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
