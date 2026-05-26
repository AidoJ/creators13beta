import { CREATOR_TYPE_COLORS, type AnimalCard } from "@/data/cards";

interface Props {
  card: AnimalCard;
  imageSrc?: string;
  size?: number; // px width (flat-to-flat)
}

/**
 * Hex-shaped board piece for the honeycomb play space.
 * Pointy-top hexagon. Background is a TRUE 50/50 split of the two Creator-Type
 * colours, cut along the diagonal between the upper-right and lower-left
 * hex vertices (rotationally symmetric → equal visual weight).
 */
export function AnimalHexPiece({ card, imageSrc, size = 140 }: Props) {
  const [t1, t2] = card.types;
  const c1 = CREATOR_TYPE_COLORS[t1];
  const c2 = CREATOR_TYPE_COLORS[t2];

  // Pointy-top hex: height = width * 2/sqrt(3)
  const h = size * 1.1547;

  // Pointy-top hex vertices (normalized 0..1):
  // T  (0.5, 0)        top
  // UR (1,   0.25)     upper-right
  // LR (1,   0.75)     lower-right
  // B  (0.5, 1)        bottom
  // LL (0,   0.75)     lower-left
  // UL (0,   0.25)     upper-left
  //
  // Split line: UR → LL passes through the centre, so each half is exactly 50%.
  const hexPoints = "0.5,0 1,0.25 1,0.75 0.5,1 0,0.75 0,0.25";
  const halfA = "0.5,0 1,0.25 0,0.75 0,0.25";       // top-left half  → c1
  const halfB = "1,0.25 1,0.75 0.5,1 0,0.75";       // bottom-right half → c2

  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: h }}
      aria-label={`${card.name} card`}
    >
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full drop-shadow-lg"
      >
        <polygon points={halfA} fill={c1} />
        <polygon points={halfB} fill={c2} />
        {/* Inner white ring */}
        <polygon
          points={hexPoints}
          fill="none"
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="0.04"
          vectorEffect="non-scaling-stroke"
        />
        {/* Outer hex outline for crisp edge */}
        <polygon
          points={hexPoints}
          fill="none"
          stroke="rgba(0,0,0,0.15)"
          strokeWidth="0.01"
        />
      </svg>

      {/* Illustration */}
      {imageSrc && (
        <img
          src={imageSrc}
          alt={card.name}
          loading="lazy"
          className="absolute left-1/2 -translate-x-1/2 object-contain pointer-events-none"
          style={{
            top: "6%",
            width: size * 0.975,
            height: size * 0.975,
          }}
        />
      )}

      {/* Mythical sparkle */}
      {card.mythical && (
        <div
          className="absolute top-[8%] right-[14%] font-bold uppercase tracking-wider bg-black/45 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm"
          style={{ fontSize: size * 0.055 }}
        >
          ✦
        </div>
      )}

      {/* Name plate — washed-out translucent background */}
      <div
        className="absolute left-1/2 -translate-x-1/2 text-center rounded-sm px-1.5 py-0.5 backdrop-blur-sm"
        style={{
          bottom: "11%",
          width: "78%",
          fontFamily: '"Lilita One", sans-serif',
          fontSize: size * 0.072,
          color: "#3a2615",
          lineHeight: 1,
          background: "rgba(255,255,255,0.55)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        }}
      >
        <div className="truncate uppercase tracking-wide">{card.name}</div>
      </div>
    </div>
  );
}
