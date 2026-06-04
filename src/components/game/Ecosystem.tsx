import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Axial, Ecosystem as EcoType } from "@/lib/game/types";
import { axialToPixel, keyOf, NEIGHBOUR_DIRS } from "@/lib/game/board";
import { legalEcoCells, skyLockedSubType } from "@/lib/game/engine";
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

    // Walk every adjacent pair of placed hexes and flag those that share at
    // least one Creator-Type / Element, regardless of which half faces which.
    const cardLabels = (card: typeof placed[number]["card"]): string[] => {
      const out: string[] = [];
      if (card.types) out.push(...card.types);
      if (card.element) out.push(card.element);
      if (card.displayType) out.push(card.displayType);
      if (card.kind === "sky_creator") out.push("Sky");
      if (card.kind === "golden_body" || card.kind === "golden_hive") out.push("*");
      return out.map((s) => s.toLowerCase());
    };
    const matches: { x: number; y: number; label: string; color: string; key: string }[] = [];
    const seenEdges = new Set<string>();
    for (const pc of placed) {
      const myLabels = cardLabels(pc.card);
      for (let dir = 0; dir < 6; dir++) {
        const d = NEIGHBOUR_DIRS[dir];
        const nPos = { q: pc.pos.q + d.q, r: pc.pos.r + d.r };
        const nKey = keyOf(nPos);
        const nb = eco.placed.get(nKey);
        if (!nb) continue;
        const edgeKey = [keyOf(pc.pos), nKey].sort().join("|");
        if (seenEdges.has(edgeKey)) continue;
        const theirLabels = cardLabels(nb.card);
        // Wildcards match anything; otherwise need a shared non-wildcard label.
        let shared: string | null = null;
        if (myLabels.includes("*") || theirLabels.includes("*")) {
          shared = (myLabels.find((l) => l !== "*") ?? theirLabels.find((l) => l !== "*")) ?? null;
        } else {
          shared = myLabels.find((l) => theirLabels.includes(l)) ?? null;
        }
        if (!shared) continue;
        seenEdges.add(edgeKey);
        const a = axialToPixel(pc.pos.q, pc.pos.r, size);
        const b = axialToPixel(nPos.q, nPos.r, size);
        const cx = (a.x + b.x) / 2 + size / 2;
        const cy = (a.y + b.y) / 2 + (size * 1.1547) / 2;
        const titleCase = shared.charAt(0).toUpperCase() + shared.slice(1);
        const color =
          CREATOR_TYPE_COLORS[titleCase as keyof typeof CREATOR_TYPE_COLORS] ??
          ELEMENT_COLORS[titleCase as keyof typeof ELEMENT_COLORS] ??
          "#ffffff";
        matches.push({ x: cx, y: cy, label: titleCase, color, key: edgeKey });
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
    // rect reflects the scaled (rendered) size, so divide by scale to get unscaled coords.
    const px = (e.clientX - rect.left) / scale;
    const py = (e.clientY - rect.top) / scale;
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
                skySubType={pc.card.kind === "sky_creator" ? skyLockedSubType(eco, pc.pos) : null}
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
        {matches.map((m) => {
          const w = Math.max(16, size * 0.22);
          const h = w * 0.55;
          return (
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
              <svg
                viewBox="0 0 100 50"
                width={w}
                height={h}
                fill="none"
                stroke={m.color}
                strokeWidth={10}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                style={{
                  filter: `drop-shadow(0 0 3px rgba(0,0,0,0.85)) drop-shadow(0 0 6px ${m.color})`,
                }}
              >
                <path d="M25,25 C25,10 5,10 5,25 C5,40 25,40 25,25 C25,10 50,40 50,25 C50,10 75,40 75,25 C75,10 95,10 95,25 C95,40 75,40 75,25 C75,40 50,10 50,25 C50,40 25,10 25,25 Z" />
              </svg>
            </div>
          );
        })}

      </div>
    </div>
  );
}
