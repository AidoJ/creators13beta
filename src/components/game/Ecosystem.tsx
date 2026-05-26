import { useMemo, useState } from "react";
import type { Axial, Ecosystem as EcoType } from "@/lib/game/types";
import { axialToPixel, keyOf } from "@/lib/game/board";
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
  /** Click a placed hex you own to rotate its background (only animals/sky-creatures
   *  have a visible split, but the handler fires for any hex). */
  onRotateClick?: (posKey: string) => void;
  /** Wrap content in a centered viewport. */
  minHeight?: number;
}

/** Show only the currently playable empty cells, matching the compact reference board. */
function buildScaffold(eco: EcoType): Axial[] {
  return legalEcoCells(eco);
}

export function Ecosystem({
  eco, size = 90, selectable, showEmpties = true,
  onPlace, onStealClick, onRotateClick, minHeight = 300,
}: Props) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const { placed, empties, legal, legalKeys, bounds } = useMemo(() => {
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
    const pad = 0;
    return {
      placed, empties, legal, legalKeys,
      bounds: {
        minX: minX - pad, minY: minY - pad,
        width: maxX - minX + size + pad * 2,
        height: maxY - minY + size * 1.1547 + pad * 2,
      },
    };
  }, [eco, selectable, showEmpties, size]);

  const offX = -bounds.minX;
  const offY = -bounds.minY;

  const placeNearestLegalHex = (e: React.DragEvent<HTMLDivElement>) => {
    if (!selectable || legal.length === 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const nearest = legal.reduce((best, cell) => {
      const { x, y } = axialToPixel(cell.q, cell.r, size);
      const cx = x + offX + size / 2;
      const cy = y + offY + (size * 1.1547) / 2;
      const d = (cx - px) ** 2 + (cy - py) ** 2;
      return d < best.d ? { cell, d } : best;
    }, { cell: legal[0], d: Number.POSITIVE_INFINITY });
    setDragOverKey(null);
    onPlace?.(nearest.cell, e.dataTransfer.getData("text/plain") || undefined);
  };

  return (
    <div className="flex items-center justify-center w-full" style={{ minHeight }}>
      <div
        className="relative"
        style={{ width: bounds.width, height: bounds.height }}
        onDragOver={selectable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
        onDrop={selectable ? placeNearestLegalHex : undefined}
      >
        {empties.map((cell) => {
          const { x, y } = axialToPixel(cell.q, cell.r, size);
          const k = keyOf(cell);
          const isLegal = legalKeys.has(k);
          const canDrop = selectable && isLegal;
          const isOver = dragOverKey === k;
          return (
            <div
              key={`e-${k}`}
              role={canDrop ? "button" : "presentation"}
              aria-label={canDrop ? `Place selected card at hex ${k}` : `Empty board hex ${k}`}
              data-hex-key={k}
              data-legal-drop={canDrop ? "true" : "false"}
              tabIndex={canDrop ? 0 : -1}
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
                pulse={false}
                active={canDrop || showEmpties}
                hover={isOver}
                onClick={canDrop ? () => onPlace?.(cell) : undefined}
              />
            </div>
          );
        })}
        {placed.map((pc) => {
          const { x, y } = axialToPixel(pc.pos.q, pc.pos.r, size);
          const k = keyOf(pc.pos);
          const clickHandler = onStealClick
            ? () => onStealClick(k)
            : onRotateClick
            ? () => onRotateClick(k)
            : undefined;
          return (
            <div key={`p-${k}`} className="absolute" style={{ left: x + offX, top: y + offY }}>
              <BoardHexPiece
                card={pc.card}
                size={size}
                rotation={pc.rotation ?? 0}
                onClick={clickHandler}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
