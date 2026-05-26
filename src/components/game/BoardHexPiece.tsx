import { CREATOR_TYPE_COLORS } from "@/data/cards";
import { ELEMENT_COLORS } from "@/lib/game/elements";
import type { DeckCard } from "@/lib/game/types";

interface Props {
  card: DeckCard;
  size?: number;
  onClick?: () => void;
  highlight?: "selected" | "match" | null;
}

/** Hex piece that renders any DeckCard kind (animal, creator, special). */
export function BoardHexPiece({ card, size = 110, onClick, highlight = null }: Props) {
  const h = size * 1.1547;
  const hexPoints = "0.5,0 1,0.25 1,0.75 0.5,1 0,0.75 0,0.25";
  const halfA = "0.5,0 1,0.25 0,0.75 0,0.25";
  const halfB = "1,0.25 1,0.75 0.5,1 0,0.75";

  let c1 = "#444";
  let c2 = "#444";
  let badge = "";
  if (card.kind === "animal" || card.kind === "sky_creature") {
    const [t1, t2] = card.types ?? [];
    c1 = CREATOR_TYPE_COLORS[t1 as keyof typeof CREATOR_TYPE_COLORS] ?? "#444";
    c2 = CREATOR_TYPE_COLORS[t2 as keyof typeof CREATOR_TYPE_COLORS] ?? c1;
    if (card.kind === "sky_creature") badge = "☁ STEAL";
  } else if (card.kind === "creator") {
    c1 = c2 = ELEMENT_COLORS[card.element!];
    badge = card.element!.toUpperCase();
  } else if (card.kind === "sky_creator") {
    c1 = ELEMENT_COLORS.Sky; c2 = "#fff";
    badge = "SKY CREATOR";
  } else if (card.kind === "golden_body") {
    c1 = "#f5c542"; c2 = "#e0a920";
    badge = "GOLDEN BODY";
  } else if (card.kind === "golden_hive") {
    c1 = "#f5c542"; c2 = "#fff";
    badge = "HIVE 🛡";
  }

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
    >
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full drop-shadow-lg">
        <polygon points={halfA} fill={c1} />
        <polygon points={halfB} fill={c2} />
        <polygon points={hexPoints} fill="none" stroke={ring} strokeWidth={highlight ? 0.06 : 0.04} vectorEffect="non-scaling-stroke" />
      </svg>
      {card.source?.art_url && (
        <img
          src={card.source.art_url}
          alt={card.name}
          loading="lazy"
          className="absolute left-1/2 -translate-x-1/2 object-contain pointer-events-none"
          style={{ top: "12%", width: size * 0.78, height: size * 0.78 }}
        />
      )}
      {badge && (
        <div
          className="absolute left-1/2 -translate-x-1/2 text-center font-bold uppercase tracking-wider text-white pointer-events-none"
          style={{ top: "38%", fontSize: size * 0.07, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}
        >
          {badge}
        </div>
      )}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-center rounded-sm px-1 py-0.5 backdrop-blur-sm pointer-events-none"
        style={{
          bottom: "11%", width: "80%",
          fontFamily: '"Lilita One", sans-serif',
          fontSize: size * 0.072, color: "#3a2615", lineHeight: 1,
          background: "rgba(255,255,255,0.65)",
        }}
      >
        <div className="truncate uppercase tracking-wide">{card.name}</div>
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
  return (
    <div
      onClick={onClick}
      className={`relative inline-block ${onClick ? "cursor-pointer" : ""} ${pulse ? "animate-pulse" : ""}`}
      style={{ width: size, height: h }}
    >
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full drop-shadow-sm">
        {active && (
          <polygon
            points={hexPoints}
            fill="none"
            stroke="hsl(var(--gold) / 0.55)"
            strokeWidth={0.09}
            vectorEffect="non-scaling-stroke"
          />
        )}
        <polygon
          points={hexPoints}
          fill={hover ? "hsl(var(--primary) / 0.22)" : active ? "hsl(var(--gold) / 0.2)" : "hsl(var(--foreground) / 0.035)"}
          stroke={active ? "hsl(var(--gold))" : "hsl(var(--foreground) / 0.45)"}
          strokeWidth={active ? 0.04 : 0.026}
          strokeDasharray={active ? undefined : "0.04,0.03"}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
