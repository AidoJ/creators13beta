import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { ELEMENT_COLORS } from "@/lib/game/elements";
import { CREATOR_TYPE_GLYPHS, ELEMENT_GLYPHS, glyphForType } from "@/lib/game/glyphs";
import type { DeckCard } from "@/lib/game/types";

interface Props {
  card: DeckCard;
  size?: number;
  onClick?: () => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  draggable?: boolean;
  highlight?: "selected" | "match" | null;
  /** 0..5 — 60° clockwise rotations applied to the hex background only. */
  rotation?: number;
}

/** Hex piece that renders any DeckCard kind (animal, creator, special).
 *  Board pieces show ONLY the artwork / glyph — no name plate — since the
 *  player has already chosen the card from the deck-style hand tile.
 *  Only the coloured background rotates; the artwork stays upright. */
export function BoardHexPiece({ card, size = 110, onClick, onDragStart, onDragEnd, draggable = false, highlight = null, rotation = 0 }: Props) {
  const h = size * 1.1547;
  const hexPoints = "0.5,0 1,0.25 1,0.75 0.5,1 0,0.75 0,0.25";
  const halfA = "0.5,0 1,0.25 0,0.75 0,0.25";
  const halfB = "1,0.25 1,0.75 0.5,1 0,0.75";

  let c1 = "#444";
  let c2 = "#444";
  let artGlyph: string | undefined;
  if (card.kind === "animal" || card.kind === "sky_creature") {
    const [t1, t2] = card.types ?? [];
    c1 = CREATOR_TYPE_COLORS[t1 as keyof typeof CREATOR_TYPE_COLORS] ?? "#444";
    c2 = CREATOR_TYPE_COLORS[t2 as keyof typeof CREATOR_TYPE_COLORS] ?? c1;
  } else if (card.kind === "creator") {
    const dt = card.displayType;
    c1 = c2 = dt ? (CREATOR_TYPE_COLORS[dt as keyof typeof CREATOR_TYPE_COLORS] ?? ELEMENT_COLORS[card.element!]) : ELEMENT_COLORS[card.element!];
    artGlyph = dt ? (CREATOR_TYPE_GLYPHS[dt] ?? ELEMENT_GLYPHS[card.element!]) : ELEMENT_GLYPHS[card.element!];
  } else if (card.kind === "sky_creator") {
    c1 = c2 = ELEMENT_COLORS.Sky;
    artGlyph = CREATOR_TYPE_GLYPHS.Sky;
  } else if (card.kind === "golden_body") {
    c1 = "#f5c542"; c2 = "#e0a920";
  } else if (card.kind === "golden_hive") {
    c1 = "#f5c542"; c2 = "#fff";
  }

  const art = card.source?.art_url ?? artGlyph;

  const ring =
    highlight === "selected" ? "rgba(255,255,255,0.95)"
    : highlight === "match" ? "rgba(255,220,120,0.95)"
    : "rgba(255,255,255,0.6)";

  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`group relative inline-block ${(onClick || draggable) ? "cursor-pointer transition-transform hover:scale-105" : ""} ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
      style={{ width: size, height: h }}
      aria-label={card.name}
      title={card.name}
    >
      {!(card.kind === "creator" || card.kind === "sky_creator") && (
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
          {card.kind === "animal" || card.kind === "sky_creature" ? (
            <>
              <polygon points={halfA} fill={c1} />
              <polygon points={halfB} fill={c2} />
            </>
          ) : (
            <polygon points={hexPoints} fill={c1} />
          )}
          <polygon points={hexPoints} fill="none" stroke={ring} strokeWidth={highlight ? 0.06 : 0.04} vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {art && (
        <img
          src={art}
          alt={card.name}
          loading="lazy"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none drop-shadow-lg"
          style={
            card.kind === "creator" || card.kind === "sky_creator"
              ? { width: "100%", height: "100%" }
              : { width: size * 0.82, height: size * 0.82 }
          }
        />
      )}
      {/* Hover tooltip overlay */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
        <div className="bg-black/80 backdrop-blur-sm rounded-lg px-2 py-1.5 flex flex-col items-center gap-1 max-w-[90%]">
          <span
            className="font-bold uppercase tracking-wide leading-none text-white truncate max-w-full"
            style={{ fontFamily: '"Lilita One", sans-serif', fontSize: size * 0.1, textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
          >
            {card.name}
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
