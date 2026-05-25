import { CREATOR_TYPE_COLORS } from "@/data/cards";
import type { GameCard } from "@/lib/gameCards";
import type { Rotation } from "@/lib/game/types";

interface Props {
  card: GameCard;
  /** 0..5 hex rotation in 60° increments. Rotates the entire piece (split + art). */
  rotation?: Rotation;
  size?: number;
  /** Optional click handler used when the piece represents a clickable hand-preview. */
  onClick?: () => void;
  highlight?: "selected" | "match" | null;
}

/**
 * Rotatable pointy-top hex piece for the play board. At rotation 0 the split
 * line runs between the upper-right and lower-left vertices — top-left half
 * is type_a, bottom-right half is type_b. The whole element rotates in 60°
 * increments which physically rotates which edge shows which type.
 */
export function BoardHexPiece({
  card,
  rotation = 0,
  size = 110,
  onClick,
  highlight = null,
}: Props) {
  const [t1, t2] = [card.type_a, card.type_b];
  const c1 = CREATOR_TYPE_COLORS[t1 as keyof typeof CREATOR_TYPE_COLORS];
  const c2 = CREATOR_TYPE_COLORS[t2 as keyof typeof CREATOR_TYPE_COLORS];

  const h = size * 1.1547;
  const hexPoints = "0.5,0 1,0.25 1,0.75 0.5,1 0,0.75 0,0.25";
  const halfA = "0.5,0 1,0.25 0,0.75 0,0.25";
  const halfB = "1,0.25 1,0.75 0.5,1 0,0.75";

  const ring =
    highlight === "selected"
      ? "rgba(255,255,255,0.95)"
      : highlight === "match"
      ? "rgba(255,220,120,0.95)"
      : "rgba(255,255,255,0.6)";

  return (
    <div
      onClick={onClick}
      className={`relative inline-block ${onClick ? "cursor-pointer transition-transform hover:scale-105" : ""}`}
      style={{
        width: size,
        height: h,
        transform: `rotate(${rotation * 60}deg)`,
        transformOrigin: "center",
      }}
      aria-label={`${card.name} (${t1}/${t2})`}
    >
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full drop-shadow-lg">
        <polygon points={halfA} fill={c1} />
        <polygon points={halfB} fill={c2} />
        <polygon
          points={hexPoints}
          fill="none"
          stroke={ring}
          strokeWidth={highlight ? 0.06 : 0.04}
          vectorEffect="non-scaling-stroke"
        />
        <polygon
          points={hexPoints}
          fill="none"
          stroke="rgba(0,0,0,0.18)"
          strokeWidth="0.01"
        />
      </svg>
      {card.art_url && (
        <img
          src={card.art_url}
          alt={card.name}
          loading="lazy"
          className="absolute left-1/2 -translate-x-1/2 object-contain pointer-events-none drop-shadow"
          style={{ top: "12%", width: size * 0.78, height: size * 0.78 }}
        />
      )}
      {card.mythical && (
        <div
          className="absolute font-bold uppercase tracking-wider bg-black/45 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm pointer-events-none"
          style={{ top: "8%", right: "14%", fontSize: size * 0.055 }}
        >
          ✦
        </div>
      )}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-center rounded-sm px-1.5 py-0.5 backdrop-blur-sm pointer-events-none"
        style={{
          bottom: "11%",
          width: "78%",
          fontFamily: '"Lilita One", sans-serif',
          fontSize: size * 0.072,
          color: "#3a2615",
          lineHeight: 1,
          background: "rgba(255,255,255,0.55)",
        }}
      >
        <div className="truncate uppercase tracking-wide">{card.name}</div>
      </div>
    </div>
  );
}

/** Empty hex outline used as a click target for legal placement cells. */
export function EmptyHexCell({
  size = 110,
  onClick,
  pulse = false,
}: {
  size?: number;
  onClick?: () => void;
  pulse?: boolean;
}) {
  const h = size * 1.1547;
  const hexPoints = "0.5,0 1,0.25 1,0.75 0.5,1 0,0.75 0,0.25";
  return (
    <div
      onClick={onClick}
      className={`relative inline-block ${onClick ? "cursor-pointer" : ""} ${pulse ? "animate-pulse" : ""}`}
      style={{ width: size, height: h }}
    >
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
        <polygon
          points={hexPoints}
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.45)"
          strokeWidth="0.025"
          strokeDasharray="0.04,0.03"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
