import type { DeckCard } from "@/lib/game/types";
import { BoardHexPiece } from "./BoardHexPiece";

interface Props {
  hand: DeckCard[];
  selectedUid?: string | null;
  onSelect: (uid: string) => void;
  onDragStart?: (uid: string) => void;
  onDragEnd?: () => void;
  disabled?: boolean;
  size?: number;
}

export function PlayerHand({ hand, selectedUid, onSelect, onDragStart, onDragEnd, disabled, size = 90 }: Props) {
  return (
    <div className="border-t border-border/40 bg-card/40 backdrop-blur p-3">
      <div className="flex flex-wrap items-end gap-3 justify-center">
        {hand.map((card) => {
          const selected = card.uid === selectedUid;
          return (
            <div
              key={card.uid}
              draggable={!disabled}
              onDragStart={(e) => {
                if (disabled) return;
                e.dataTransfer.setData("text/plain", card.uid);
                e.dataTransfer.effectAllowed = "move";
                onSelect(card.uid);
                onDragStart?.(card.uid);
              }}
              onDragEnd={() => onDragEnd?.()}
              className={`transition-transform cursor-grab active:cursor-grabbing ${selected ? "-translate-y-2" : ""} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
            >
              <BoardHexPiece
                card={card}
                size={size}
                onClick={() => onSelect(card.uid)}
                highlight={selected ? "selected" : null}
              />
            </div>
          );
        })}
        {hand.length === 0 && <div className="text-sm text-muted-foreground italic">No cards in hand.</div>}
      </div>
    </div>
  );
}
