/**
 * LotusProfile — Appendix 7 visual.
 *
 * Built on top of the gold-outline lotus PNG (8 petals). Only the 4 cardinal
 * petals are functional content slots; the 4 diagonal petals are always
 * transparent so the dashboard background shows through them.
 *
 * Fill order for 1–4 creator types:
 *   1 → right
 *   2 → right, left
 *   3 → right, left, top
 *   4 → right, left, top, bottom
 *
 * source = 'self_selected' → glyph at ~60% opacity with a thin outline ring
 * source = 'practitioner' | 'case_study' → glyph at full opacity, no ring
 *
 * Featured-Creator-of-the-Month highlight has two visual treatments —
 * 'glow' (soft outer drop-shadow in the featured colour) or
 * 'ring' (a subtle additional gold ring just outside the lotus).
 */
import { CSSProperties, useMemo } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { capitaliseTypeName, getCreatorTypeColor } from "@/lib/creatorTypes";
import { glyphMarkForType } from "@/lib/game/glyphs";
import lotusFrame from "@/assets/lotus-frame.png.asset.json";

export type LotusCreatorType = {
  type: string;
  source: "self_selected" | "practitioner" | "case_study";
};

export type FeaturedHighlight = "glow" | "ring" | null;

export interface LotusProfileProps {
  avatarUrl: string | null;
  displayName: string;
  creatorTypes: LotusCreatorType[];
  size?: "sm" | "md" | "lg" | "xl";
  onClick?: () => void;
  className?: string;
  featuredHighlight?: FeaturedHighlight;
  featuredColor?: string;
}

const SIZE_PX: Record<NonNullable<LotusProfileProps["size"]>, number> = {
  sm: 80,
  md: 110,
  lg: 150,
  xl: 200,
};

const SKY_NEUTRAL = "#edd58a";
const GOLD = "#c9a04a";

// Cardinal petal centres as % of the lotus PNG bounding box.
// Eyeballed from the 1024x1024 reference so each disc sits inside its petal outline.
const CARDINALS = {
  top:    { x: 50, y: 14 },
  right:  { x: 86, y: 50 },
  bottom: { x: 50, y: 86 },
  left:   { x: 14, y: 50 },
} as const;

type CardinalKey = keyof typeof CARDINALS;

// Fill order per spec.
const FILL_ORDER: CardinalKey[][] = [
  [],
  ["right"],
  ["right", "left"],
  ["right", "left", "top"],
  ["right", "left", "top", "bottom"],
];

function petalColor(type: string): string {
  if (type.toLowerCase() === "sky") return SKY_NEUTRAL;
  return getCreatorTypeColor(type);
}

export function LotusProfile({
  avatarUrl,
  displayName,
  creatorTypes,
  size = "md",
  onClick,
  className,
  featuredHighlight = null,
  featuredColor,
}: LotusProfileProps) {
  const px = SIZE_PX[size];
  const interactive = typeof onClick === "function";

  // Map filled cardinals → creator type
  const slots = useMemo(() => {
    const types = creatorTypes.slice(0, 4);
    const order = FILL_ORDER[types.length] ?? [];
    const map: Partial<Record<CardinalKey, LotusCreatorType>> = {};
    order.forEach((key, i) => {
      map[key] = types[i];
    });
    return map;
  }, [creatorTypes]);

  // Petal disc size as % of bounding box (slightly smaller than petal so the
  // gold outline of the lotus PNG remains visible around the fill).
  const petalDiscPct = 22;
  // Avatar diameter as % of bounding box. Slightly oversized vs the inner
  // circle of the lotus PNG to mask any sub-pixel gold ring at the edge.
  const avatarPct = 44;

  const outerStyle: CSSProperties = { width: px, height: px };

  // Featured glow: soft outer drop-shadow using the featured colour.
  const glowFilter =
    featuredHighlight === "glow" && featuredColor
      ? `drop-shadow(0 0 ${px * 0.06}px ${featuredColor}cc) drop-shadow(0 0 ${px * 0.12}px ${featuredColor}66)`
      : undefined;

  return (
    <div
      className={cn(
        "relative inline-block select-none aspect-square",
        interactive && "cursor-pointer transition-transform hover:scale-[1.03] active:scale-[0.98]",
        className
      )}
      style={outerStyle}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      aria-label={`${displayName} profile frame`}
    >
      {/* Optional outer gold ring highlight */}
      {featuredHighlight === "ring" && (
        <div
          aria-hidden
          className="absolute rounded-full pointer-events-none"
          style={{
            inset: `-${Math.max(3, px * 0.025)}px`,
            border: `${Math.max(2, px * 0.018)}px solid ${GOLD}`,
            boxShadow: `0 0 ${px * 0.04}px ${GOLD}80`,
            opacity: 0.9,
          }}
        />
      )}

      {/* Lotus + fills wrapper (the glow filter wraps the lotus so the
          drop-shadow follows the actual petal outline). */}
      <div
        className="absolute inset-0"
        style={glowFilter ? { filter: glowFilter } : undefined}
      >
        {/* Cardinal petal fills (behind the lotus PNG so its gold outline frames them) */}
        {(Object.keys(CARDINALS) as CardinalKey[]).map((key) => {
          const slot = slots[key];
          if (!slot) return null;
          const pos = CARDINALS[key];
          const color = petalColor(slot.type);
          return (
            <div
              key={`fill-${key}`}
              aria-hidden
              className="absolute rounded-full"
              style={{
                width: `${petalDiscPct}%`,
                height: `${petalDiscPct}%`,
                left: `${pos.x - petalDiscPct / 2}%`,
                top: `${pos.y - petalDiscPct / 2}%`,
                backgroundColor: color,
              }}
            />
          );
        })}

        {/* Lotus gold-outline frame */}
        <img
          src={lotusFrame.url}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
      </div>

      {/* Cardinal glyphs — rendered above the lotus so they're crisp */}
      {(Object.keys(CARDINALS) as CardinalKey[]).map((key) => {
        const slot = slots[key];
        if (!slot) return null;
        const pos = CARDINALS[key];
        const glyph = glyphMarkForType(capitaliseTypeName(slot.type));
        if (!glyph) return null;
        const glyphSizePct = petalDiscPct * 0.65;
        const muted = slot.source === "self_selected";
        const ringSize = petalDiscPct * 0.95;
        return (
          <div key={`glyph-${key}`} className="pointer-events-none absolute">
            {muted && (
              <div
                className="absolute rounded-full"
                style={{
                  width: `${ringSize / petalDiscPct * petalDiscPct}%`,
                }}
              />
            )}
            {/* Self-selected: outline ring around the glyph */}
            {muted && (
              <div
                aria-hidden
                className="absolute rounded-full border"
                style={{
                  width: `${ringSize * (px / 100)}px`,
                  height: `${ringSize * (px / 100)}px`,
                  left: `${pos.x * (px / 100) - (ringSize * (px / 100)) / 2}px`,
                  top: `${pos.y * (px / 100) - (ringSize * (px / 100)) / 2}px`,
                  borderColor: "rgba(255,255,255,0.85)",
                  borderWidth: Math.max(1, px * 0.008),
                }}
              />
            )}
            <img
              src={glyph}
              alt=""
              aria-hidden
              draggable={false}
              style={{
                position: "absolute",
                width: `${glyphSizePct * (px / 100)}px`,
                height: `${glyphSizePct * (px / 100)}px`,
                left: `${pos.x * (px / 100) - (glyphSizePct * (px / 100)) / 2}px`,
                top: `${pos.y * (px / 100) - (glyphSizePct * (px / 100)) / 2}px`,
                opacity: muted ? 0.6 : 0.95,
                filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.3))",
              }}
            />
          </div>
        );
      })}

      {/* Central avatar — oversized slightly to mask sub-pixel rounding */}
      <div
        className="absolute rounded-full overflow-hidden bg-muted flex items-center justify-center"
        style={{
          width: `${avatarPct}%`,
          height: `${avatarPct}%`,
          left: `${50 - avatarPct / 2}%`,
          top: `${50 - avatarPct / 2}%`,
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <User
            className="text-muted-foreground/70"
            style={{ width: "55%", height: "55%" }}
            strokeWidth={1.75}
          />
        )}
      </div>
    </div>
  );
}

export default LotusProfile;
