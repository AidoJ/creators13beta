import { useRef } from "react";
import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { ELEMENT_COLORS } from "@/lib/game/elements";
import { CREATOR_TYPE_GLYPHS, ELEMENT_GLYPHS, glyphForType, glyphMarkForType } from "@/lib/game/glyphs";
import type { DeckCard } from "@/lib/game/types";
import { TypeGlyphMark, displayCardName } from "./cards/TypeGlyphMark";
import { cardCodeLabel } from "@/lib/creatorTypeCode";
import goldenBodyArt from "@/assets/golden-body-card.png";
import goldenHiveArt from "@/assets/golden-hive-card.png";

interface Props {
  card: DeckCard;
  size?: number;
  onClick?: () => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  draggable?: boolean;
  /** Touch / pointer fallback for iOS Safari & iPad where HTML5 drag events
   *  do not fire reliably. Parent should treat these the same as onDragStart /
   *  onDragEnd. */
  onTouchDragStart?: () => void;
  onTouchDragEnd?: () => void;
  highlight?: "selected" | "match" | null;
  /** 0..5 — 60° clockwise rotations applied to the hex background only. */
  rotation?: number;
  /** For Sky Creator only — when set, paints half-Sky / half-this-type so
   *  the board visually shows which sub-type the Sky has locked onto. */
  skySubType?: string | null;
  /** For Golden Body only — when set, paints half-gold / half-this-type so
   *  the board shows which Creator the wildcard has locked onto. */
  goldenLockedType?: string | null;
}

/** Hex piece that renders any DeckCard kind (animal, creator, special).
 *  Board pieces show ONLY the artwork / glyph — no name plate — since the
 *  player has already chosen the card from the deck-style hand tile.
 *  Only the coloured background rotates; the artwork stays upright. */
export function BoardHexPiece({ card, size = 110, onClick, onDragStart, onDragEnd, draggable = false, onTouchDragStart, onTouchDragEnd, highlight = null, rotation = 0, skySubType = null, goldenLockedType = null }: Props) {
  const h = size * 1.1547;
  // Pointer-based drag fallback state (iOS Safari / iPad).
  const ptrRef = useRef<{ id: number; x: number; y: number; dragging: boolean; suppressClick: boolean } | null>(null);
  const THRESHOLD = 8;
  const hexPoints = "0.5,0 1,0.25 1,0.75 0.5,1 0,0.75 0,0.25";
  const halfA = "0.5,0 1,0.25 0,0.75 0,0.25";
  const halfB = "1,0.25 1,0.75 0.5,1 0,0.75";
  const isCreatorLike = card.kind === "creator" || card.kind === "sky_creator" || card.kind === "golden_body" || card.kind === "golden_hive";
  let c1 = "#444";
  let c2 = "#444";
  let artGlyph: string | undefined;
  let halfGlyph1: string | undefined;
  let halfGlyph2: string | undefined;
  // Sky Creator that has locked a sub-type renders as a true two-colour split,
  // same shape as animal cards, so the board shows the locked sub-type at a glance.
  const skySplit = card.kind === "sky_creator" && !!skySubType;
  // Golden Body locked to a Creator renders gold / locked-type split for the
  // same visual feedback.
  const goldenSplit = card.kind === "golden_body" && !!goldenLockedType;
  if (card.kind === "animal" || card.kind === "sky_creature") {
    const [t1, t2] = card.types ?? [];
    c1 = CREATOR_TYPE_COLORS[t1 as keyof typeof CREATOR_TYPE_COLORS] ?? "#444";
    c2 = CREATOR_TYPE_COLORS[t2 as keyof typeof CREATOR_TYPE_COLORS] ?? c1;
    halfGlyph1 = glyphMarkForType(t1 as string);
    halfGlyph2 = t2 && t2 !== t1 ? glyphMarkForType(t2 as string) : undefined;
  } else if (card.kind === "creator") {
    const dt = card.displayType;
    c1 = c2 = dt ? (CREATOR_TYPE_COLORS[dt as keyof typeof CREATOR_TYPE_COLORS] ?? ELEMENT_COLORS[card.element!]) : ELEMENT_COLORS[card.element!];
    artGlyph = dt ? (CREATOR_TYPE_GLYPHS[dt] ?? ELEMENT_GLYPHS[card.element!]) : ELEMENT_GLYPHS[card.element!];
  } else if (card.kind === "sky_creator") {
    c1 = ELEMENT_COLORS.Sky;
    c2 = skySplit
      ? (CREATOR_TYPE_COLORS[skySubType as keyof typeof CREATOR_TYPE_COLORS] ?? ELEMENT_COLORS.Sky)
      : ELEMENT_COLORS.Sky;
    artGlyph = CREATOR_TYPE_GLYPHS.Sky;
  } else if (card.kind === "golden_body") {
    c1 = "#f5c542";
    c2 = goldenSplit
      ? (CREATOR_TYPE_COLORS[goldenLockedType as keyof typeof CREATOR_TYPE_COLORS] ?? ELEMENT_COLORS[goldenLockedType as keyof typeof ELEMENT_COLORS] ?? "#e0a920")
      : "#e0a920";
    artGlyph = goldenBodyArt;
  } else if (card.kind === "golden_hive") {
    c1 = "#f5c542"; c2 = "#fff"; artGlyph = goldenHiveArt;
  }

  const art = card.source?.art_url ?? artGlyph;
  const displayName = displayCardName(card.name);
  const codeLabel = cardCodeLabel(card);

  const ring =
    highlight === "selected" ? "rgba(255,255,255,0.95)"
    : highlight === "match" ? "rgba(255,220,120,0.95)"
    : "rgba(255,255,255,0.6)";

  return (
    <div
      onClick={(e) => {
        if (ptrRef.current?.suppressClick) {
          ptrRef.current.suppressClick = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick?.();
      }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onPointerDown={draggable ? (e) => {
        if (e.pointerType === "mouse") return; // mouse uses native HTML5 drag
        ptrRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false, suppressClick: false };
      } : undefined}
      onPointerMove={draggable ? (e) => {
        const p = ptrRef.current;
        if (!p || p.id !== e.pointerId) return;
        if (!p.dragging) {
          const dx = e.clientX - p.x;
          const dy = e.clientY - p.y;
          if (dx * dx + dy * dy >= THRESHOLD * THRESHOLD) {
            p.dragging = true;
            p.suppressClick = true;
            onTouchDragStart?.();
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          }
        }
        if (p.dragging) e.preventDefault();
      } : undefined}
      onPointerUp={draggable ? (e) => {
        const p = ptrRef.current;
        if (!p || p.id !== e.pointerId) return;
        ptrRef.current = null;
        if (p.dragging) {
          const dropTarget = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest('[data-legal-drop="true"]') as HTMLElement | null;
          dropTarget?.click();
          onTouchDragEnd?.();
        }
      } : undefined}
      onPointerCancel={draggable ? () => {
        const p = ptrRef.current;
        ptrRef.current = null;
        if (p?.dragging) onTouchDragEnd?.();
      } : undefined}
      className={`group relative inline-block ${(onClick || draggable) ? "cursor-pointer transition-transform hover:scale-105" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ width: size, height: h, touchAction: draggable ? "none" : undefined }}
      aria-label={displayName}
      title={displayName}
    >
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full drop-shadow-lg"
        style={{
          transform: rotation ? `rotate(${rotation * 60}deg)` : undefined,
          transformOrigin: "center",
          transition: "transform 220ms ease",
        }}
      >
        {card.kind === "animal" || card.kind === "sky_creature" || skySplit || goldenSplit ? (
          <>
            <polygon points={halfA} fill={c1} />
            <polygon points={halfB} fill={c2} />
          </>
        ) : (
          <polygon points={hexPoints} fill={c1} />
        )}
        <polygon points={hexPoints} fill="none" stroke={ring} strokeWidth={highlight ? 0.06 : 0.04} vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Rotating glyph layer — keeps each glyph over its colour half */}
      {(halfGlyph1 || halfGlyph2) && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            transform: rotation ? `rotate(${rotation * 60}deg)` : undefined,
            transformOrigin: "center",
            transition: "transform 220ms ease",
          }}
        >
          {halfGlyph1 && (
            <TypeGlyphMark
              glyph={halfGlyph1}
              size={size * 0.24}
              style={{ position: "absolute", top: "16%", left: "8%" }}
            />
          )}
          {halfGlyph2 && (
            <TypeGlyphMark
              glyph={halfGlyph2}
              size={size * 0.24}
              style={{ position: "absolute", bottom: "20%", right: "8%" }}
            />
          )}
        </div>
      )}
      {art && isCreatorLike ? (
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-lg">
          <image
            href={art}
            x="-0.15"
            y="-0.047"
            width="1.28"
            height="1.077"
            preserveAspectRatio="none"
          />
        </svg>
      ) : art ? (
        <img
          src={art}
          alt={card.name}
          decoding="async"
          fetchPriority="high"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none drop-shadow-lg"
          style={{ width: size * 0.8, height: size * 0.8 }}
        />
      ) : null}
      {isCreatorLike && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none"
          style={{ bottom: "10%" }}
        >
          <span
            className="inline-block px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider text-white bg-black/55 backdrop-blur-sm"
            style={{
              fontFamily: '"Questrial", sans-serif',
              fontSize: Math.max(8, size * 0.1),
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
              letterSpacing: "0.08em",
            }}
          >
            {card.kind === "sky_creator" ? "SKY" : (card.element ? String(card.element).toUpperCase() : "")}
          </span>
        </div>
      )}

      {/* Hover tooltip overlay */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-sm rounded-lg px-2 py-1.5 flex flex-col items-center gap-1 max-w-[90%]">
          <span
            className="font-normal uppercase tracking-wide leading-none text-white truncate max-w-full"
            style={{ fontFamily: '"Questrial", sans-serif', fontSize: size * 0.1, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
          >
            {displayName}
          </span>
          <div className="flex items-center gap-1 flex-wrap justify-center">
            {resolveTypeChips(card).map((chip, i) => (
              <span key={chip.label + i} className="contents">
                {i > 0 && <span className="text-white/50 text-[8px]">+</span>}
                <span className="inline-flex items-center gap-0.5 font-semibold uppercase tracking-wider text-white" style={{ fontSize: size * 0.07 }}>
                  {chip.glyph ? (
                    <img src={chip.glyph} alt="" className="object-contain" style={{ width: size * 0.1, height: size * 0.1 }} aria-hidden />
                  ) : (
                    <span className="rounded-full" style={{ width: size * 0.06, height: size * 0.06, background: chip.color }} aria-hidden />
                  )}
                  {chip.label}
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyHexCell({
  size = 110,
  onClick,
  pulse = false,
  active = false,
  hover = false,
}: {
  size?: number;
  onClick?: () => void;
  pulse?: boolean;
  active?: boolean;
  hover?: boolean;
}) {
  const h = size * 1.1547;
  const hexPoints = "0.5,0 1,0.25 1,0.75 0.5,1 0,0.75 0,0.25";
  const fill = hover ? "hsl(var(--board-hex-active) / 0.1)" : "hsl(var(--board-hex-empty) / 0.18)";
  const stroke = active ? "hsl(var(--board-hex-active))" : "hsl(var(--board-hex-line))";
  const strokeOpacity = active ? 0.86 : 0.7;
  return (
    <div
      onClick={onClick}
      className={`relative inline-block ${onClick ? "cursor-pointer" : ""} ${pulse ? "animate-pulse" : ""}`}
      style={{ width: size, height: h }}
    >
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <polygon
          points={hexPoints}
          fill={fill}
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth={active ? 2.5 : 1.5}
          strokeDasharray="10 7"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
  </div>
  );
}

function resolveTypeChips(card: DeckCard): { label: string; color: string; glyph?: string }[] {
  if (card.kind === "animal" || card.kind === "sky_creature") {
    const [t1, t2] = card.types ?? [];
    const c1 = CREATOR_TYPE_COLORS[t1 as keyof typeof CREATOR_TYPE_COLORS] ?? "#888";
    const c2 = CREATOR_TYPE_COLORS[t2 as keyof typeof CREATOR_TYPE_COLORS] ?? c1;
    return [
      { label: String(t1 ?? ""), color: c1, glyph: glyphForType(t1 as string) },
      ...(t2 && t2 !== t1 ? [{ label: String(t2), color: c2, glyph: glyphForType(t2 as string) }] : []),
    ].filter((c) => c.label);
  }
  if (card.kind === "creator") {
    const dt = card.displayType;
    const label = dt ?? card.element!;
    const c = dt ? (CREATOR_TYPE_COLORS[dt as keyof typeof CREATOR_TYPE_COLORS] ?? ELEMENT_COLORS[card.element!]) : ELEMENT_COLORS[card.element!];
    const g = dt ? (CREATOR_TYPE_GLYPHS[dt] ?? ELEMENT_GLYPHS[card.element!]) : ELEMENT_GLYPHS[card.element!];
    return [{ label, color: c, glyph: g }];
  }
  if (card.kind === "sky_creator") {
    const c = ELEMENT_COLORS.Sky;
    const g = CREATOR_TYPE_GLYPHS.Sky;
    return [{ label: "Sky", color: c, glyph: g }];
  }
  if (card.kind === "golden_body") {
    return [{ label: "Golden Body", color: "#f5c542" }];
  }
  if (card.kind === "golden_hive") {
    return [{ label: "Hive", color: "#e0a920" }];
  }
  return [];
}
