import { useMemo, useState } from "react";
import type { Axial, Ecosystem as EcoType } from "@/lib/game/types";
import { axialToPixel, keyOf, neighbours } from "@/lib/game/board";
import { legalEcoCells } from "@/lib/game/engine";
import { BoardHexPiece, EmptyHexCell } from "./BoardHexPiece";

interface Props {
  eco: EcoType;
  size?: number;
  /** When true, empty hexes are clickable + accept drops + pulse. */
  selectable?: boolean;
  /** Always show empty hexes (even if not selectable), so the board scaffold is visible. */
  showEmpties?: boolean;
  onPlace?: (pos: Axial, cardUid?: string) => void;
  onStealClick?: (posKey: string) => void;
  /** Wrap content in a centered viewport. */
  minHeight?: number;
}

/** Build a visible board scaffold: all legal cells PLUS their neighbours (one ring out),
 *  so the player always sees a honeycomb shape, not a single hex. */
function buildScaffold(eco: EcoType): Axial[] {
  const legal = legalEcoCells(eco);
  const seen = new Map<string, Axial>();
  for (const c of legal) seen.set(keyOf(c), c);
  for (const c of legal) {
    for (const n of neighbours(c)) {
      const k = keyOf(n);
      if (!eco.placed.has(k) && !seen.has(k)) seen.set(k, n);
    }
  }
  // Also if ecosystem is completely empty, add a 2-ring around (0,0)
  if (eco.placed.size === 0) {
    for (let q = -2; q <= 2; q++) {
      for (let r = -2; r <= 2; r++) {
        if (Math.abs(q + r) > 2) continue;
        const k = keyOf({ q, r });
        if (!seen.has(k)) seen.set(k, { q, r });
      }
    }
  }
  return Array.from(seen.values());
}

export function Ecosystem({
  eco, size = 90, selectable, showEmpties = true,
  onPlace, onStealClick, minHeight = 300,
}: Props) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const { placed, empties, legalKeys, bounds } = useMemo(() => {
    const placed = Array.from(eco.placed.values());
    const legal = legalEcoCells(eco);
    const legalKeys = new Set(legal.map(keyOf));
    const empties = showEmpties || selectable ? buildScaffold(eco) : [];
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
      placed, empties, legalKeys,
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
          const k = keyOf(cell);
          const isLegal = legalKeys.has(k);
          const canDrop = selectable && isLegal;
          const isOver = dragOverKey === k;
          return (
            <div
              key={`e-${k}`}
              className="absolute"
              style={{ left: x + offX, top: y + offY, transform: isOver ? "scale(1.08)" : undefined, transition: "transform 120ms" }}
              onDragOver={canDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverKey(k); } : undefined}
              onDragLeave={canDrop ? () => setDragOverKey((cur) => (cur === k ? null : cur)) : undefined}
              onDrop={canDrop ? (e) => {
                e.preventDefault();
                setDragOverKey(null);
                onPlace?.(cell, e.dataTransfer.getData("text/plain") || undefined);
              } : undefined}
            >
              <EmptyHexCell
                size={size}
                pulse={canDrop}
                active={canDrop}
                hover={isOver}
                onClick={canDrop ? () => onPlace?.(cell) : undefined}
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
