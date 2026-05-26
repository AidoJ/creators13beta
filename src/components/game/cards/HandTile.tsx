import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { ELEMENT_COLORS } from "@/lib/game/elements";
import { CREATOR_TYPE_GLYPHS, ELEMENT_GLYPHS, glyphForType } from "@/lib/game/glyphs";
import type { DeckCard } from "@/lib/game/types";

interface Props {
  card: DeckCard;
  size?: number;
  selected?: boolean;
  dimmed?: boolean;
}

export function HandTile({ card, size = 96, selected = false, dimmed = false }: Props) {
  const height = size * 1.35;
  const { c1, c2, chips, badge, artGlyph } = resolveColours(card);
  const art = card.source?.art_url ?? artGlyph;

  return (
    <div
      className={`relative rounded-2xl overflow-hidden shadow-lg border bg-white flex flex-col transition-all ${
        selected ? "border-amber-400 ring-2 ring-amber-300 -translate-y-2" : "border-border/40"
      } ${dimmed ? "opacity-70 saturate-75" : ""}`}
      style={{ width: size, height }}
      aria-label={card.name}
    >
      {/* Art panel */}
      <div className="relative" style={{ height: "72%" }}>
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full" aria-hidden>
          {card.kind === "animal" || card.kind === "sky_creature" ? (
            <>
              <polygon points="0,0 1,0 0,1" fill={c1} />
              <polygon points="1,0 1,1 0,1" fill={c2} />
            </>
          ) : (
            <polygon points="0,0 1,0 1,1 0,1" fill={c1} />
          )}
        </svg>
        {badge && (
          <div className="absolute top-1.5 right-1.5 z-20 text-[8px] font-bold uppercase tracking-wider bg-black/55 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
            {badge}
          </div>
        )}
        <div className="absolute inset-0 z-10 flex items-center justify-center p-2">
          {art ? (
            <img
              src={art}
              alt={card.name}
              loading="lazy"
              className="max-h-full max-w-full object-contain pointer-events-none"
              style={{
                filter:
                  "drop-shadow(0 4px 8px rgba(0,0,0,0.5)) drop-shadow(0 2px 3px rgba(0,0,0,0.35))",
              }}
            />
          ) : (
            <div className="text-white/80 text-[10px] font-medium uppercase tracking-wide">{card.kind}</div>
          )}
        </div>
      </div>

      {/* Name plate */}
      <div className="relative z-10 bg-white px-1.5 py-1 text-center flex-1 flex flex-col justify-center">
        <div
          className="font-bold uppercase tracking-wide leading-none truncate"
          style={{ fontFamily: '"Lilita One", sans-serif', fontSize: size * 0.11, color: "#000" }}
        >
          {card.name}
        </div>
        <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
          {chips.map((chip, i) => (
            <span key={chip.label + i} className="contents">
              {i > 0 && <span className="text-black/40 text-[9px]">+</span>}
              <span
                className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider"
                style={{ fontSize: size * 0.075, color: "#000" }}
              >
                {chip.glyph ? (
                  <img
                    src={chip.glyph}
                    alt=""
                    className="object-contain"
                    style={{ width: size * 0.11, height: size * 0.11 }}
                    aria-hidden
                  />
                ) : (
                  <span
                    className="rounded-full"
                    style={{ width: size * 0.06, height: size * 0.06, background: chip.color }}
                    aria-hidden
                  />
                )}
                {chip.label}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function resolveColours(card: DeckCard): {
  c1: string;
  c2: string;
  chips: { label: string; color: string; glyph?: string }[];
  badge?: string;
  artGlyph?: string;
} {
  if (card.kind === "animal" || card.kind === "sky_creature") {
    const [t1, t2] = card.types ?? [];
    const c1 = CREATOR_TYPE_COLORS[t1 as keyof typeof CREATOR_TYPE_COLORS] ?? "#888";
    const c2 = CREATOR_TYPE_COLORS[t2 as keyof typeof CREATOR_TYPE_COLORS] ?? c1;
    const chips = [
      { label: String(t1 ?? ""), color: c1, glyph: glyphForType(t1 as string) },
      ...(t2 && t2 !== t1
        ? [{ label: String(t2), color: c2, glyph: glyphForType(t2 as string) }]
        : []),
    ].filter((c) => c.label);
    return { c1, c2, chips, badge: card.kind === "sky_creature" ? "Sky" : undefined };
  }
  if (card.kind === "creator") {
    const c = ELEMENT_COLORS[card.element!];
    const g = ELEMENT_GLYPHS[card.element!];
    return { c1: c, c2: c, chips: [{ label: card.element!, color: c, glyph: g }], badge: "Creator", artGlyph: g };
  }
  if (card.kind === "sky_creator") {
    const c = ELEMENT_COLORS.Sky;
    const g = CREATOR_TYPE_GLYPHS.Sky;
    return { c1: c, c2: "#ffffff", chips: [{ label: "Sky", color: c, glyph: g }], badge: "Wild", artGlyph: g };
  }
  if (card.kind === "golden_body") {
    return { c1: "#f5c542", c2: "#e0a920", chips: [{ label: "Golden", color: "#e0a920" }], badge: "Wild Body" };
  }
  if (card.kind === "golden_hive") {
    return { c1: "#f5c542", c2: "#ffffff", chips: [{ label: "Hive", color: "#e0a920" }], badge: "Shield" };
  }
  return { c1: "#666", c2: "#666", chips: [] };
}
