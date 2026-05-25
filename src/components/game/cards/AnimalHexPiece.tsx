import { CREATOR_TYPE_COLORS, type AnimalCard } from "@/data/cards";

interface Props {
  card: AnimalCard;
  imageSrc?: string;
  size?: number; // px width (flat-to-flat)
}

/**
 * Hex-shaped board piece for the honeycomb play space.
 * Pointy-top hexagon, diagonal-split background of the two Creator-Type
 * colours, animal illustration centred, tiny name plate at the bottom.
 *
 * Use this on the game board. Use AnimalCardTile for the deck/hand display.
 */
export function AnimalHexPiece({ card, imageSrc, size = 140 }: Props) {
  const [t1, t2] = card.types;
  const c1 = CREATOR_TYPE_COLORS[t1];
  const c2 = CREATOR_TYPE_COLORS[t2];

  // Pointy-top hex: height = width * 2/sqrt(3)
  const h = size * 1.1547;
  // SVG clip path id unique per render
  const clipId = `hex-${card.slug}`;

  return (
    <div
      className="relative inline-block"
      style={{ width: size, height: h }}
      aria-label={`${card.name} card`}
    >
      <svg width="0" height="0" className="absolute">
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            {/* pointy-top hex normalized */}
            <polygon points="0.5,0 1,0.25 1,0.75 0.5,1 0,0.75 0,0.25" />
          </clipPath>
        </defs>
      </svg>

      <div
        className="absolute inset-0 shadow-lg"
        style={{
          clipPath: `url(#${clipId})`,
          background: `linear-gradient(135deg, ${c1} 0%, ${c1} 50%, ${c2} 50%, ${c2} 100%)`,
        }}
      >
        {/* Inner border ring */}
        <div
          className="absolute inset-[3%]"
          style={{
            clipPath: `url(#${clipId})`,
            background: `linear-gradient(135deg, ${c1} 0%, ${c1} 50%, ${c2} 50%, ${c2} 100%)`,
            boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.55)",
          }}
        />

        {/* Illustration */}
        {imageSrc && (
          <img
            src={imageSrc}
            alt={card.name}
            loading="lazy"
            className="absolute left-1/2 -translate-x-1/2 object-contain drop-shadow-md pointer-events-none"
            style={{
              top: "12%",
              width: size * 0.78,
              height: size * 0.78,
            }}
          />
        )}

        {/* Mythical sparkle */}
        {card.mythical && (
          <div
            className="absolute top-[8%] right-[14%] text-[10px] font-bold uppercase tracking-wider bg-black/45 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm"
            style={{ fontSize: size * 0.055 }}
          >
            ✦
          </div>
        )}

        {/* Name plate */}
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-white/95 text-center rounded-sm px-2 py-0.5"
          style={{
            bottom: "10%",
            width: "70%",
            fontFamily: '"Lilita One", sans-serif',
            fontSize: size * 0.1,
            color: "#3a2615",
            lineHeight: 1,
          }}
        >
          <div className="truncate uppercase tracking-wide">{card.name}</div>
        </div>
      </div>
    </div>
  );
}
