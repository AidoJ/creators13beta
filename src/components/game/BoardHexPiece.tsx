import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { ELEMENT_COLORS } from "@/lib/game/elements";
import { CREATOR_TYPE_GLYPHS, ELEMENT_GLYPHS } from "@/lib/game/glyphs";
import type { DeckCard } from "@/lib/game/types";

interface Props {
  card: DeckCard;
  size?: number;
  onClick?: () => void;
  highlight?: "selected" | "match" | null;
  /** 0..5 — 60° clockwise rotations applied to the hex background only. */
  rotation?: number;
}

/** Hex piece that renders any DeckCard kind (animal, creator, special).
 *  Board pieces show ONLY the artwork / glyph — no name plate — since the
 *  player has already chosen the card from the deck-style hand tile.
 *  Only the coloured background rotates; the artwork stays upright. */
export function BoardHexPiece({ card, size = 110, onClick, highlight = null, rotation = 0 }: Props) {
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
    c1 = c2 = ELEMENT_COLORS[card.element!];
    artGlyph = ELEMENT_GLYPHS[card.element!];
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
      className={`relative inline-block ${onClick ? "cursor-pointer transition-transform hover:scale-105" : ""}`}
      style={{ width: size, height: h }}
      aria-label={card.name}
      title={card.name}
    >
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full drop-shadow-lg">
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
      {art && (
        <img
          src={art}
          alt={card.name}
          loading="lazy"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none"
          style={{
            width: size * 0.82,
            height: size * 0.82,
            filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.45)) drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
          }}
        />
      )}
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
