import { CREATOR_TYPE_COLORS, type AnimalCard } from "@/data/cards";

interface Props {
  card: AnimalCard;
  imageSrc?: string;
  size?: number; // px width
}

/**
 * Hex-shaped animal card. Background is a diagonal split of the two
 * Creator-Type colours (from A'Hara's palette). Animal illustration sits
 * on top, name + type pair across the bottom.
 */
export function AnimalCardTile({ card, imageSrc, size = 220 }: Props) {
  const [t1, t2] = card.types;
  const c1 = CREATOR_TYPE_COLORS[t1];
  const c2 = CREATOR_TYPE_COLORS[t2];

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-lg border border-border/30 flex flex-col"
      style={{ width: size, height: size * 1.35 }}
    >
      {/* True 50/50 split background — diagonal from top-right corner to bottom-left corner */}
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        <polygon points="0,0 1,0 0,1" fill={c1} />
        <polygon points="1,0 1,1 0,1" fill={c2} />
      </svg>
      {/* Mythical badge */}
      {card.mythical && (
        <div className="absolute top-2 right-2 z-20 text-[10px] font-bold uppercase tracking-wider bg-black/40 text-white px-2 py-0.5 rounded-full backdrop-blur-sm">
          Mythical
        </div>
      )}
      {/* Illustration */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-3">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={card.name}
            loading="lazy"
            className="max-h-full max-w-full object-contain drop-shadow-md"
          />
        ) : (
          <div className="text-white/70 text-xs font-medium">no art</div>
        )}
      </div>
      {/* Name plate */}
      <div className="relative z-10 bg-white/95 backdrop-blur-sm px-3 py-2 text-center">
        <div
          className="font-bold uppercase tracking-wide leading-none truncate"
          style={{ fontFamily: '"Lilita One", sans-serif', fontSize: size * 0.085, color: "#3a2615" }}
        >
          {card.name}
        </div>
        <div className="flex items-center justify-center gap-1.5 mt-1.5">
          <TypeChip name={t1} color={c1} />
          <span className="text-[#3a2615]/40 text-xs">+</span>
          <TypeChip name={t2} color={c2} />
        </div>
      </div>
    </div>
  );
}

function TypeChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
      style={{ color: "#3a2615" }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: color }} aria-hidden />
      {name}
    </span>
  );
}
