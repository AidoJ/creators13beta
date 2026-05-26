import { useMemo } from "react";
import type { Axial, Ecosystem as EcoType } from "@/lib/game/types";
import { axialToPixel, keyOf } from "@/lib/game/board";
import { legalEcoCells } from "@/lib/game/engine";
import { BoardHexPiece, EmptyHexCell } from "./BoardHexPiece";

interface Props {
  eco: EcoType;
  size?: number;
  selectable?: boolean;
  onPlace?: (pos: Axial) => void;
  onStealClick?: (posKey: string) => void;
}

export function Ecosystem({ eco, size = 100, selectable, onPlace, onStealClick }: Props) {
  const { placed, empties, bounds } = useMemo(() => {
    const placed = Array.from(eco.placed.values());
    const empties = selectable ? legalEcoCells(eco) : [];
    const all: Axial[] = [...placed.map((p) => p.pos), ...empties];
    if (all.length === 0) all.push({ q: 0, r: 0 });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of all) {
      const { x, y } = axialToPixel(p.q, p.r, size);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return {
      placed, empties,
      bounds: { minX, minY, width: maxX - minX + size, height: maxY - minY + size * 1.1547 },
    };
  }, [eco, selectable, size]);

  const offX = -bounds.minX;
  const offY = -bounds.minY;

  return (
    <div className="relative mx-auto" style={{ width: bounds.width, height: bounds.height, minHeight: size }}>
      {empties.map((cell) => {
        const { x, y } = axialToPixel(cell.q, cell.r, size);
        return (
          <div key={`e-${keyOf(cell)}`} className="absolute" style={{ left: x + offX, top: y + offY }}>
            <EmptyHexCell size={size} pulse onClick={() => onPlace?.(cell)} />
          </div>
        );
      })}
      {placed.map((pc) => {
        const { x, y } = axialToPixel(pc.pos.q, pc.pos.r, size);
        const k = keyOf(pc.pos);
        return (
          <div key={`p-${k}`} className="absolute" style={{ left: x + offX, top: y + offY }}>
            <BoardHexPiece card={pc.card} size={size} onClick={onStealClick ? () => onStealClick(k) : undefined} />
          </div>
        );
      })}
    </div>
  );
}
