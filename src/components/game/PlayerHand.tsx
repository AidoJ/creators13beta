import type { GameCard } from "@/lib/gameCards";
import { BoardHexPiece } from "./BoardHexPiece";
import { Button } from "@/components/ui/button";

interface Props {
  hand: GameCard[];
  selectedSlug?: string | null;
  onSelect: (slug: string) => void;
  onDiscard: () => void;
  disabled?: boolean;
  size?: number;
}

export function PlayerHand({
  hand,
  selectedSlug,
  onSelect,
  onDiscard,
  disabled,
  size = 100,
}: Props) {
  return (
    <div className="border-t border-border/40 bg-card/40 backdrop-blur p-3">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          {hand.map((card) => {
            const selected = card.slug === selectedSlug;
            return (
              <div
                key={card.slug}
                className={`transition-transform ${selected ? "-translate-y-2" : ""} ${
                  disabled ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                <BoardHexPiece
                  card={card}
                  size={size}
                  onClick={() => onSelect(card.slug)}
                  highlight={selected ? "selected" : null}
                />
              </div>
            );
          })}
          {hand.length === 0 && (
            <div className="text-sm text-muted-foreground italic">
              No cards in hand.
            </div>
          )}
        </div>
        <Button
          variant="outline"
          onClick={onDiscard}
          disabled={disabled || !selectedSlug}
        >
          Discard selected
        </Button>
      </div>
    </div>
  );
}
