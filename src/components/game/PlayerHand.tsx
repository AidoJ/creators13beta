import type { DeckCard } from "@/lib/game/types";
import { BoardHexPiece } from "./BoardHexPiece";

interface Props {
  hand: DeckCard[];
  selectedUid?: string | null;
  onSelect: (uid: string) => void;
  disabled?: boolean;
  size?: number;
}

export function PlayerHand({ hand, selectedUid, onSelect, disabled, size = 90 }: Props) {
  return (
    <div className="border-t border-border/40 bg-card/40 backdrop-blur p-3">
      <div className="flex flex-wrap items-end gap-3 justify-center">
        {hand.map((card) => {
          const selected = card.uid === selectedUid;
          return (
            <div
              key={card.uid}
              className={`transition-transform ${selected ? "-translate-y-2" : ""} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
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
