import { useMemo } from "react";
import type { Axial, Ecosystem as EcoType } from "@/lib/game/types";
import { axialToPixel, keyOf } from "@/lib/game/board";
import { legalEcoCells } from "@/lib/game/engine";
import { BoardHexPiece, EmptyHexCell } from "./BoardHexPiece";

interface Props {
  eco: EcoType;
  size?: number;
  /** When true, empty hexes are clickable + pulse (use when human can place). */
  selectable?: boolean;
  /** Always show empty hexes (even if not selectable), so the board scaffold is visible. */
  showEmpties?: boolean;
  onPlace?: (pos: Axial) => void;
  onStealClick?: (posKey: string) => void;
  /** Wrap content in a centered viewport so very small / very large ecos don't break the parent. */
  minHeight?: number;
}

export function Ecosystem({
  eco, size = 90, selectable, showEmpties = true,
  onPlace, onStealClick, minHeight = 300,
}: Props) {
  const { placed, empties, bounds } = useMemo(() => {
    const placed = Array.from(eco.placed.values());
    const empties = showEmpties || selectable ? legalEcoCells(eco) : [];
    const all: Axial[] = [...placed.map((p) => p.pos), ...empties];
    if (all.length === 0) all.push({ q: 0, r: 0 });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of all) {
      const { x, y } = axialToPixel(p.q, p.r, size);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const pad = size * 0.2;
    return {
      placed, empties,
      bounds: {
        minX: minX - pad, minY: minY - pad,
        width: maxX - minX + size + pad * 2,
        height: maxY - minY + size * 1.1547 + pad * 2,
      },
    };
  }, [eco, selectable, showEmpties, size]);

  const offX = -bounds.minX;
  const offY = -bounds.minY;

  return (
    <div className="flex items-center justify-center w-full" style={{ minHeight }}>
      <div className="relative" style={{ width: bounds.width, height: bounds.height }}>
        {empties.map((cell) => {
          const { x, y } = axialToPixel(cell.q, cell.r, size);
          return (
            <div key={`e-${keyOf(cell)}`} className="absolute" style={{ left: x + offX, top: y + offY }}>
              <EmptyHexCell
                size={size}
                pulse={selectable}
                onClick={selectable ? () => onPlace?.(cell) : undefined}
              />
            </div>
          );
        })}
        {placed.map((pc) => {
          const { x, y } = axialToPixel(pc.pos.q, pc.pos.r, size);
          const k = keyOf(pc.pos);
          return (
            <div key={`p-${k}`} className="absolute" style={{ left: x + offX, top: y + offY }}>
              <BoardHexPiece
                card={pc.card}
                size={size}
                onClick={onStealClick ? () => onStealClick(k) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
