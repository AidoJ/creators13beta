import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";
import type { Axial, Ecosystem as EcoType } from "@/lib/game/types";
import { axialToPixel, keyOf, parseKey } from "@/lib/game/board";
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
  // User zoom (on top of autoFit scale) + pan. Pinch-to-zoom on touch, or
  // the +/-/⤢ buttons on any device. Panning only becomes active when
  // zoomed in. Two-finger pan avoids conflict with single-finger card drag.
  const [userZoom, setUserZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    startMid: { x: number; y: number };
    startPan: { x: number; y: number };
    pointers: Map<number, { x: number; y: number }>;
  } | null>(null);
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 3;

  const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
  const resetZoom = useCallback(() => { setUserZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const bumpZoom = useCallback((delta: number) => {
    setUserZoom((z) => {
      const next = clampZoom(z + delta);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);


  const { placed, empties, legal, legalKeys, bounds } = useMemo(() => {
    const placed = Array.from(eco.placed.values());
    const legal = legalEcoCells(eco, moveFromKey ?? undefined);
    const legalKeys = new Set(legal.map(keyOf));
    const empties = showEmpties || selectable ? buildScaffold(eco, moveFromKey) : [];
    // Content bounds = placed hexes + the legal placement fringe. This is
    // what the player cares about; the coordinate origin (0,0) is irrelevant.
    // Symmetrising around origin puts content in one half when growth is
    // one-sided — instead we take the true min/max of the content region so
    // it sits centered inside the container regardless of direction.
    const contentCells: Axial[] = [...placed.map((p) => p.pos), ...empties];
    if (contentCells.length === 0) contentCells.push({ q: 0, r: 0 });
    const hexW = size;
    const hexH = size * 1.1547;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of contentCells) {
      const { x, y } = axialToPixel(p.q, p.r, size);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x + hexW);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y + hexH);
    }
    return {
      placed, empties, legal, legalKeys,
      bounds: {
        minX,
        minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  }, [eco, selectable, showEmpties, size, moveFromKey]);

  const offX = -bounds.minX;
  const offY = -bounds.minY;

  const clampPanForZoom = useCallback((nextPan: { x: number; y: number }, zoom: number) => {
    const el = wrapRef.current;
    if (!el) return nextPan;
    const effectiveScale = (autoFit ? scale : 1) * zoom;
    const scaledW = bounds.width * effectiveScale;
    const scaledH = bounds.height * effectiveScale;
    const maxPanX = Math.max(0, (scaledW - el.clientWidth) / 2);
    const maxPanY = Math.max(0, (scaledH - el.clientHeight) / 2);
    return {
      x: Math.max(-maxPanX, Math.min(maxPanX, nextPan.x)),
      y: Math.max(-maxPanY, Math.min(maxPanY, nextPan.y)),
    };
  }, [autoFit, scale, bounds.width, bounds.height]);

  useEffect(() => {
    setPan((cur) => userZoom <= 1 ? { x: 0, y: 0 } : clampPanForZoom(cur, userZoom));
  }, [userZoom, clampPanForZoom]);

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

  // Follow-the-action: when the ecosystem grows, drift pan so the newest
  // placement slides toward the viewport centre. Only active when the user
  // is zoomed in (otherwise autoFit already shows the whole board and
  // panning would clip an edge). Clamped so the board can't be pushed
  // off-screen. Purely local render state — never enters engine/PvP sync.
  const prevPlacedKeysRef = useRef<Set<string>>(new Set());
  const [lastPlacedKey, setLastPlacedKey] = useState<string | null>(null);
  useEffect(() => {
    const currentKeys = new Set<string>();
    let newKey: string | null = null;
    for (const k of eco.placed.keys()) {
      currentKeys.add(k);
      if (!prevPlacedKeysRef.current.has(k)) newKey = k;
    }
    prevPlacedKeysRef.current = currentKeys;
    if (newKey) setLastPlacedKey(newKey);
  }, [eco.placed]);

  useEffect(() => {
    if (!lastPlacedKey || userZoom <= 1) return;
    const el = wrapRef.current;
    if (!el) return;
    const pos = parseKey(lastPlacedKey);
    const { x, y } = axialToPixel(pos.q, pos.r, size);
    const hxCenter = x + offX + size / 2;
    const hyCenter = y + offY + (size * 1.1547) / 2;
    const boardCenterX = bounds.width / 2;
    const boardCenterY = bounds.height / 2;
    const effectiveScale = (autoFit ? scale : 1) * userZoom;
    const targetPanX = (boardCenterX - hxCenter) * effectiveScale;
    const targetPanY = (boardCenterY - hyCenter) * effectiveScale;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    const scaledW = bounds.width * effectiveScale;
    const scaledH = bounds.height * effectiveScale;
    const maxPanX = Math.max(0, (scaledW - cw) / 2);
    const maxPanY = Math.max(0, (scaledH - ch) / 2);
    setPan({
      x: Math.max(-maxPanX, Math.min(maxPanX, targetPanX)),
      y: Math.max(-maxPanY, Math.min(maxPanY, targetPanY)),
    });
  }, [lastPlacedKey, userZoom, scale, autoFit, size, offX, offY, bounds.width, bounds.height]);



  const placeNearestLegalHex = (e: React.DragEvent<HTMLDivElement>) => {
    if (!selectable) return;
    e.preventDefault();
    if (legal.length === 0) {
      toast.error("No legal spots on your board for this action right now.");
      return;
    }
    // The board is rendered inside a `translate(pan) scale(effectiveScale)`
    // wrapper with `transform-origin: center center`, so undo BOTH the pan and
    // the centre-anchored scale before comparing against un-transformed hex
    // pixel coords. Ignoring the pan made zoomed drops snap to the wrong hex.
    const rect = e.currentTarget.getBoundingClientRect();
    const effectiveScale = (autoFit ? scale : 1) * userZoom;
    const px = (e.clientX - rect.left) / effectiveScale;
    const py = (e.clientY - rect.top) / effectiveScale;

    // Only snap to cells the selected card can actually occupy.
    const candidates = legalForCard ? legal.filter(legalForCard) : legal;
    if (candidates.length === 0) {
      // Silent-fail here reads as "card jumped back to my hand". Surface why.
      toast.error(illegalReason ?? "This card has no legal spot — needs a neighbour that shares a Creator Type.");
      return;
    }

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


  // Two-finger pinch + pan handlers. Single-touch is deliberately ignored
  // so card drag (touchDrag) continues to work unchanged.
  const onPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "touch") return;
    const p = pinchRef.current ?? { startDist: 0, startZoom: userZoom, startMid: { x: 0, y: 0 }, startPan: pan, pointers: new Map() };
    p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p.pointers.size === 2) {
      const [a, b] = Array.from(p.pointers.values());
      p.startDist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      p.startZoom = userZoom;
      p.startMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      p.startPan = { ...pan };
    }
    pinchRef.current = p;
  };
  const onPointerMoveCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pinchRef.current;
    if (!p || !p.pointers.has(e.pointerId)) return;
    p.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p.pointers.size !== 2) return;
    e.preventDefault();
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const [a, b] = Array.from(p.pointers.values());
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const nextZoom = clampZoom(p.startZoom * (dist / p.startDist));
    // Anchor the pinch midpoint: the board point under the fingers stays put,
    // so you can zoom into a specific corner rather than always the centre.
    const ratio = nextZoom / p.startZoom;
    const anchorX = (p.startMid.x - cx) - p.startPan.x;
    const anchorY = (p.startMid.y - cy) - p.startPan.y;
    setUserZoom(nextZoom);
    setPan(clampPanForZoom({
      x: (mid.x - cx) - ratio * anchorX,
      y: (mid.y - cy) - ratio * anchorY,
    }, nextZoom));
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = pinchRef.current;
    if (!p) return;
    p.pointers.delete(e.pointerId);
    if (p.pointers.size === 0) pinchRef.current = null;
    if (userZoom <= 1) setPan({ x: 0, y: 0 });
  };

  return (
    <div
      ref={wrapRef}
      className="relative flex items-center justify-center w-full h-full overflow-hidden"
      style={autoFit ? { minHeight: 0, touchAction: "none" } : { minHeight, touchAction: userZoom > 1 ? "none" : undefined }}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onPointerLeave={endPointer}
    >
      {/* Zoom controls — always visible so mobile players can tap them
          when pinch is awkward. Positioned inside the wrap so they follow
          the board area. */}
      <div className="absolute top-1 right-1 z-30 flex flex-col gap-1 pointer-events-auto">
        <button
          type="button"
          onClick={() => bumpZoom(0.4)}
          aria-label="Zoom in on board"
          className="h-11 w-11 rounded-full bg-background/85 border border-border shadow flex items-center justify-center active:scale-95"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => bumpZoom(-0.4)}
          aria-label="Zoom out on board"
          className="h-11 w-11 rounded-full bg-background/85 border border-border shadow flex items-center justify-center active:scale-95"
          disabled={userZoom <= MIN_ZOOM}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        {userZoom > 1 && (
          <button
            type="button"
            onClick={resetZoom}
            aria-label="Reset zoom"
            className="h-11 w-11 rounded-full bg-background/85 border border-border shadow flex items-center justify-center active:scale-95"
          >
            <Maximize className="w-4 h-4" />
          </button>
        )}
      </div>

      <div
        className="relative shrink-0"
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${(autoFit ? scale : 1) * userZoom})`,
          transformOrigin: "center center",
          transition: pinchRef.current ? "none" : "transform 120ms ease-out",
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
              className="absolute data-[touch-over=true]:z-10"
              style={{
                left: x + offX,
                top: y + offY,
                transform: isOver ? "scale(1.08)" : undefined,
                transition: "transform 120ms",
                opacity: isIllegalForCard ? 0.35 : 1,
                cursor: isIllegalForCard ? "not-allowed" : undefined,
                filter: undefined,
              }}
              onDragOver={canDrop ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverKey(k); } : undefined}
              onDragLeave={canDrop ? () => setDragOverKey((cur) => (cur === k ? null : cur)) : undefined}
              onDrop={canDrop ? (e) => {
                e.preventDefault();
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
