import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Axial, Ecosystem as EcoType } from "@/lib/game/types";
import { axialToPixel, keyOf, NEIGHBOUR_DIRS } from "@/lib/game/board";
import { legalEcoCells } from "@/lib/game/engine";
import { facingTypeLabel } from "@/lib/game/rotation";
import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { ELEMENT_COLORS } from "@/lib/game/elements";
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
}

/** Show only the currently playable empty cells, matching the compact reference board. */
function buildScaffold(eco: EcoType, excludeKey?: string | null): Axial[] {
  return legalEcoCells(eco, excludeKey ?? undefined);
}

export function Ecosystem({
  eco, size = 90, selectable, showEmpties = true,
  onPlace, onStealClick, onRotateClick, onMoveDragStart, onMoveDragEnd, minHeight = 300, moveFromKey = null,
  autoFit = false,
}: Props) {
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  const { placed, empties, legal, legalKeys, bounds, matches } = useMemo(() => {
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

    // Walk every adjacent pair of placed hexes and flag those whose facing
    // halves share the exact same Creator-Type / Element label.
    const matches: { x: number; y: number; label: string; color: string; key: string }[] = [];
    const seenEdges = new Set<string>();
    for (const pc of placed) {
      for (let dir = 0; dir < 6; dir++) {
        const d = NEIGHBOUR_DIRS[dir];
        const nPos = { q: pc.pos.q + d.q, r: pc.pos.r + d.r };
        const nKey = keyOf(nPos);
        const nb = eco.placed.get(nKey);
        if (!nb) continue;
        const edgeKey = [keyOf(pc.pos), nKey].sort().join("|");
        if (seenEdges.has(edgeKey)) continue;
        const mine = facingTypeLabel(pc.card, pc.rotation ?? 0, dir);
        const theirs = facingTypeLabel(nb.card, nb.rotation ?? 0, (dir + 3) % 6);
        if (!mine || !theirs) continue;
        if (mine.toLowerCase() !== theirs.toLowerCase()) continue;
        seenEdges.add(edgeKey);
        const a = axialToPixel(pc.pos.q, pc.pos.r, size);
        const b = axialToPixel(nPos.q, nPos.r, size);
        const cx = (a.x + b.x) / 2 + size / 2;
        const cy = (a.y + b.y) / 2 + (size * 1.1547) / 2;
        const color =
          CREATOR_TYPE_COLORS[mine as keyof typeof CREATOR_TYPE_COLORS] ??
          ELEMENT_COLORS[mine as keyof typeof ELEMENT_COLORS] ??
          "#ffffff";
        matches.push({ x: cx, y: cy, label: mine, color, key: edgeKey });
      }
    }

    return {
      placed, empties, legal, legalKeys, matches,
      bounds: {
        minX: minX - pad, minY: minY - pad,
        width: maxX - minX + size + pad * 2,
        height: maxY - minY + size * 1.1547 + pad * 2,
      },
    };
  }, [eco, selectable, showEmpties, size, moveFromKey]);

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
          const canDragMove = !!onMoveDragStart && !onStealClick;
          return (
            <div key={`p-${k}`} className="absolute" style={{ left: x + offX, top: y + offY }}>
              <BoardHexPiece
                card={pc.card}
                size={size}
                rotation={pc.rotation ?? 0}
                onClick={clickHandler}
                draggable={canDragMove}
                onDragStart={canDragMove ? (e) => {
                  e.dataTransfer.setData("text/plain", `move:${k}`);
                  e.dataTransfer.effectAllowed = "move";
                  onMoveDragStart?.(k);
                } : undefined}
                onDragEnd={canDragMove ? () => onMoveDragEnd?.() : undefined}
                highlight={moveFromKey === k ? "selected" : null}
              />
            </div>
          );
        })}
        {matches.map((m) => (
          <div
            key={`m-${m.key}`}
            className="absolute z-30 pointer-events-none animate-scale-in"
            style={{
              left: m.x + offX,
              top: m.y + offY,
              transform: "translate(-50%, -50%)",
            }}
            title={`Matched: ${m.label}`}
          >
            <div
              className="flex items-center gap-1 rounded-full pl-1 pr-1.5 py-0.5 bg-black/85 border border-white/60 shadow-lg backdrop-blur-sm"
              style={{ boxShadow: `0 0 10px ${m.color}, 0 2px 4px rgba(0,0,0,0.6)` }}
            >
              <span
                className="rounded-full shrink-0"
                style={{
                  width: Math.max(8, size * 0.12),
                  height: Math.max(8, size * 0.12),
                  background: m.color,
                  boxShadow: `0 0 6px ${m.color}`,
                }}
              />
              <span
                className="font-bold uppercase tracking-wider text-white leading-none"
                style={{ fontFamily: '"Lilita One", sans-serif', fontSize: Math.max(9, size * 0.11) }}
              >
                {m.label}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
