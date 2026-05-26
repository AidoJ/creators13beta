import type { DeckCard } from "@/lib/game/types";
import { HandTile } from "./cards/HandTile";

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
  return (
    <div className="border-t border-border/40 bg-card/40 backdrop-blur p-3">
      <div className="flex flex-wrap items-end gap-3 justify-center">
        {hand.map((card) => {
          const selected = card.uid === selectedUid;
          return (
            <div
              key={card.uid}
              draggable={!disabled}
              onClick={() => !disabled && onSelect(card.uid)}
              onPointerDown={(e) => {
                if (disabled) return;
                // Don't hijack pointer events that targeted an inner button (e.g. Info ⓘ).
                if ((e.target as HTMLElement).closest("button")) return;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                onSelect(card.uid);
              }}
              onPointerUp={(e) => {
                if (disabled) return;
                const dropTarget = document
                  .elementFromPoint(e.clientX, e.clientY)
                  ?.closest('[data-legal-drop="true"]') as HTMLElement | null;
                dropTarget?.click();
              }}
              onDragStart={(e) => {
                if (disabled) return;
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
              className={`cursor-grab active:cursor-grabbing ${disabled ? "pointer-events-none" : ""}`}
            >
              <HandTile card={card} size={size} selected={selected} dimmed={disabled} />
            </div>
          );
        })}
        {hand.length === 0 && <div className="text-sm text-muted-foreground italic">No cards in hand.</div>}
      </div>
    </div>
  );
}
