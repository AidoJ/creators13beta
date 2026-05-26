import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { ELEMENT_COLORS } from "@/lib/game/elements";
import { CREATOR_TYPE_GLYPHS, ELEMENT_GLYPHS, glyphForType } from "@/lib/game/glyphs";
import type { DeckCard } from "@/lib/game/types";

/** Lighten (amt > 0) or darken (amt < 0) a hex colour by mixing with white/black. */
function shade(hex: string, amt: number): string {
  const m = hex.replace("#", "");
  const n = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const mix = (c: number) => Math.round((t - c) * p + c);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

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
      className={`group relative inline-block ${onClick ? "cursor-pointer transition-transform hover:scale-105" : ""}`}
      style={{ width: size, height: h }}
      aria-label={card.name}
      title={card.name}
    >
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        style={{
          transform: rotation ? `rotate(${rotation * 60}deg)` : undefined,
          transformOrigin: "center",
          transition: "transform 220ms ease",
          filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.45))",
        }}
      >
        <defs>
          <radialGradient id={`g1-${card.uid}`} cx="0.35" cy="0.3" r="0.9">
            <stop offset="0%" stopColor={shade(c1, 0.4)} />
            <stop offset="55%" stopColor={c1} />
            <stop offset="100%" stopColor={shade(c1, -0.3)} />
          </radialGradient>
          <radialGradient id={`g2-${card.uid}`} cx="0.65" cy="0.7" r="0.9">
            <stop offset="0%" stopColor={shade(c2, 0.4)} />
            <stop offset="55%" stopColor={c2} />
            <stop offset="100%" stopColor={shade(c2, -0.3)} />
          </radialGradient>
          <linearGradient id={`sheen-${card.uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="40%" stopColor="rgba(255,255,255,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.3)" />
          </linearGradient>
        </defs>
        {card.kind === "animal" || card.kind === "sky_creature" ? (
          <>
            <polygon points={halfA} fill={`url(#g1-${card.uid})`} />
            <polygon points={halfB} fill={`url(#g2-${card.uid})`} />
          </>
        ) : (
          <polygon points={hexPoints} fill={`url(#g1-${card.uid})`} />
        )}
        <polygon points={hexPoints} fill={`url(#sheen-${card.uid})`} style={{ mixBlendMode: "soft-light" as any }} />
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
    const c = ELEMENT_COLORS[card.element!];
    const g = ELEMENT_GLYPHS[card.element!];
    return [{ label: card.element!, color: c, glyph: g }];
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
