import { useMemo } from "react";
import type { MatchState, Axial } from "@/lib/game/types";
import { keyOf } from "@/lib/game/board";
import { legalCells, canPlace, evaluatePlacement } from "@/lib/game/match";
import type { GameCard } from "@/lib/gameCards";
import { BoardHexPiece, EmptyHexCell } from "./BoardHexPiece";

interface Props {
  state: MatchState;
  size?: number;
  /** Card currently selected from the human's hand (for placement preview). */
  selectedCard?: GameCard | null;
  onPlace?: (pos: Axial) => void;
}

/** Pixel position for an axial coord on a pointy-top hex grid. */
function axialToPixel(q: number, r: number, size: number) {
  // size = flat-to-flat width. radius = size / sqrt(3).
  const W = size;
  const H = size * 1.1547;
  return {
    x: W * (q + r / 2),
    y: H * 0.75 * r,
  };
}

export function GameBoard({ state, size = 110, selectedCard, onPlace }: Props) {
  const { placed, empties, bounds } = useMemo(() => {
    const placed = Array.from(state.board.values());
    const empties = selectedCard
      ? legalCells(state.board).filter((c) => canPlace(selectedCard, c, state.board))
      : [];

    // Bounding box of all hex centres so we can centre the board in its viewport.
    const all: Axial[] = [...placed.map((p) => p.pos), ...empties];
    if (all.length === 0) all.push({ q: 0, r: 0 });

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of all) {
      const { x, y } = axialToPixel(p.q, p.r, size);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return {
      placed,
      empties,
      bounds: {
        minX, maxX, minY, maxY,
        width: maxX - minX + size,
        height: maxY - minY + size * 1.1547,
      },
    };
  }, [state.board, selectedCard, size]);

  // Translate hex centres into the positive quadrant + add half-size margin so
  // the top-left hex isn't clipped.
  const offsetX = -bounds.minX;
  const offsetY = -bounds.minY;

  return (
    <div
      className="relative mx-auto"
      style={{ width: bounds.width, height: bounds.height, minHeight: 300 }}
    >
      {/* Empty legal cells underneath placed cards */}
      {empties.map((cell) => {
        const { x, y } = axialToPixel(cell.q, cell.r, size);
        return (
          <div
            key={`empty-${keyOf(cell)}`}
            className="absolute"
            style={{ left: x + offsetX, top: y + offsetY }}
          >
            <EmptyHexCell size={size} pulse onClick={() => onPlace?.(cell)} />
          </div>
        );
      })}

      {/* Placed cards */}
      {placed.map((pc) => {
        const { x, y } = axialToPixel(pc.pos.q, pc.pos.r, size);
        return (
          <div
            key={`p-${keyOf(pc.pos)}`}
            className="absolute"
            style={{ left: x + offsetX, top: y + offsetY }}
          >
            <BoardHexPiece card={pc.card} rotation={pc.rotation} size={size} />
          </div>
        );
      })}

      {/* If board is empty and a card is selected, show the origin as the only legal cell */}
      {state.board.size === 0 && selectedCard && (
        <div
          className="absolute"
          style={{
            left: axialToPixel(0, 0, size).x + offsetX,
            top: axialToPixel(0, 0, size).y + offsetY,
          }}
        >
          <EmptyHexCell size={size} pulse onClick={() => onPlace?.({ q: 0, r: 0 })} />
        </div>
      )}
    </div>
  );
}
