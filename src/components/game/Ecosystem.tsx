import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Axial, Ecosystem as EcoType } from "@/lib/game/types";
import { axialToPixel, keyOf } from "@/lib/game/board";
import { legalEcoCells, skyLockedSubType, goldenBodyLockedType } from "@/lib/game/engine";
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
  onMoveDragStart?: (posKey: string) => void;
  onMoveDragEnd?: () => void;
  /** Wrap content in a centered viewport. */
  minHeight?: number;
  /** When in "move" mode, the key of the placed card the player has picked up.
   *  Empty hexes are recomputed as if this hex were removed, and the source is
   *  highlighted to show it's selected. */
  moveFromKey?: string | null;
  /** When true, shrinks (and can grow up to `size`) so the whole board fits the
   *  parent container as the ecosystem expands. */
  autoFit?: boolean;
  /** Optional per-cell predicate. When provided, cells that are board-legal
   *  (adjacent + empty) but fail this predicate are rendered greyed-out and
   *  cannot accept a drop — used to show adjacency-type-match illegal cells
   *  for the currently selected hand card. */
  legalForCard?: (pos: Axial) => boolean;
  /** Tooltip shown on the greyed-out illegal cells (fallback when
   *  `tooltipForCell` isn't provided). */
  illegalReason?: string;
  /** Per-cell tooltip text. When provided, takes precedence over
   *  `illegalReason` and also surfaces on legal cells (positive confirmation
   *  like "Shares Snow with Snow Creator"). */
  tooltipForCell?: (pos: Axial) => string | undefined;
}




/** Show only the currently playable empty cells, matching the compact reference board. */
function buildScaffold(eco: EcoType, excludeKey?: string | null): Axial[] {
  return legalEcoCells(eco, excludeKey ?? undefined);
}

export function Ecosystem({
  eco, size = 90, selectable, showEmpties = true,
  onPlace, onStealClick, onRotateClick, onMoveDragStart, onMoveDragEnd, minHeight = 300, moveFromKey = null,
  autoFit = false, legalForCard, illegalReason, tooltipForCell,
}: Props) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const { placed, empties, legal, legalKeys, bounds } = useMemo(() => {
    const placed = Array.from(eco.placed.values());
    const legal = legalEcoCells(eco, moveFromKey ?? undefined);
    const legalKeys = new Set(legal.map(keyOf));
    const empties = showEmpties || selectable ? buildScaffold(eco, moveFromKey) : [];
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
  }, [eco, selectable, showEmpties, size, moveFromKey]);

  const offX = -bounds.minX;
  const offY = -bounds.minY;

  // Auto-fit: observe parent container size and scale the board uniformly.
  useLayoutEffect(() => {
    if (!autoFit) { setScale(1); return; }
    const el = wrapRef.current;
    if (!el) return;
    const recalc = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw <= 0 || ch <= 0 || bounds.width <= 0 || bounds.height <= 0) return;
      // Tiny breathing margin so edges don't touch the container.
      const s = Math.min(cw / bounds.width, ch / bounds.height) * 0.98;
      setScale(Math.max(0.2, Math.min(1, s)));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [autoFit, bounds.width, bounds.height]);

  const placeNearestLegalHex = (e: React.DragEvent<HTMLDivElement>) => {
    if (!selectable || legal.length === 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / scale;
    const py = (e.clientY - rect.top) / scale;
    // Only snap to cells the selected card can actually occupy.
    const candidates = legalForCard ? legal.filter(legalForCard) : legal;
    if (candidates.length === 0) return; // nothing legal — let parent toast
    const nearest = candidates.reduce((best, cell) => {
      const { x, y } = axialToPixel(cell.q, cell.r, size);
      const cx = x + offX + size / 2;
      const cy = y + offY + (size * 1.1547) / 2;
      const d = (cx - px) ** 2 + (cy - py) ** 2;
      return d < best.d ? { cell, d } : best;
    }, { cell: candidates[0], d: Number.POSITIVE_INFINITY });
    setDragOverKey(null);
    onPlace?.(nearest.cell, e.dataTransfer.getData("text/plain") || undefined);
  };


  return (
    <div
      ref={wrapRef}
      className="flex items-center justify-center w-full h-full"
      style={autoFit ? { minHeight: 0 } : { minHeight }}
    >
      <div
        className="relative"
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: autoFit ? `scale(${scale})` : undefined,
          transformOrigin: "center center",
        }}
        onDragOver={selectable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } : undefined}
        onDrop={selectable ? placeNearestLegalHex : undefined}
      >
        {empties.map((cell) => {
          const { x, y } = axialToPixel(cell.q, cell.r, size);
          const k = keyOf(cell);
          const isLegal = legalKeys.has(k);
          const passesCard = legalForCard ? legalForCard(cell) : true;
          const isIllegalForCard = isLegal && legalForCard != null && !passesCard;
          const canDrop = selectable && isLegal && passesCard;
          const isOver = dragOverKey === k;
          const perCellTip = tooltipForCell?.(cell);
          const tooltip = perCellTip
            ?? (isIllegalForCard
              ? (illegalReason ?? "Doesn't share a Creator Type with this neighbour")
              : undefined);

          return (
            <div
              key={`e-${k}`}
              role={canDrop ? "button" : "presentation"}
              aria-label={canDrop ? `Place selected card at hex ${k}` : `Empty board hex ${k}`}
              data-hex-key={k}
              data-legal-drop={canDrop ? "true" : "false"}
              title={tooltip}
              tabIndex={canDrop ? 0 : -1}
              className="absolute"
              style={{
                left: x + offX,
                top: y + offY,
                transform: isOver ? "scale(1.08)" : undefined,
                transition: "transform 120ms",
                opacity: isIllegalForCard ? 0.35 : 1,
                cursor: isIllegalForCard ? "not-allowed" : undefined,
              }}
              onDragOver={canDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverKey(k); } : undefined}
              onDragLeave={canDrop ? () => setDragOverKey((cur) => (cur === k ? null : cur)) : undefined}
              onDrop={canDrop ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragOverKey(null);
                onPlace?.(cell, e.dataTransfer.getData("text/plain") || undefined);
              } : undefined}
              onClick={canDrop ? () => onPlace?.(cell) : undefined}
            >
              <EmptyHexCell
                size={size}
                pulse={false}
                active={canDrop || (showEmpties && !isIllegalForCard)}
                hover={isOver}
                onClick={undefined}
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
          const canDragMove = !!onMoveDragStart && !onStealClick;
          return (
            <div key={`p-${k}`} className="absolute" style={{ left: x + offX, top: y + offY }}>
              <BoardHexPiece
                card={pc.card}
                size={size}
                rotation={pc.rotation ?? 0}
                skySubType={pc.card.kind === "sky_creator" ? skyLockedSubType(eco, pc.pos) : null}
                goldenLockedType={pc.card.kind === "golden_body" ? goldenBodyLockedType(eco, pc.pos) : null}
                onClick={clickHandler}
                draggable={canDragMove}
                onDragStart={canDragMove ? (e) => {
                  e.dataTransfer.setData("text/plain", `move:${k}`);
                  e.dataTransfer.effectAllowed = "move";
                  onMoveDragStart?.(k);
                } : undefined}
                onDragEnd={canDragMove ? () => onMoveDragEnd?.() : undefined}
                onTouchDragStart={canDragMove ? () => onMoveDragStart?.(k) : undefined}
                onTouchDragEnd={canDragMove ? () => onMoveDragEnd?.() : undefined}
                highlight={moveFromKey === k ? "selected" : null}
              />
            </div>
          );
        })}

      </div>
    </div>
  );
}
