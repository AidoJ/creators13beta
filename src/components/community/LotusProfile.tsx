/**
 * LotusProfile — Appendix 7 visual.
 *
 * Native 8-petal SVG lotus (see LotusFrame). Only the 4 cardinal petals are
 * functional content slots; the 4 diagonal petals are always transparent so
 * the dashboard background shows through them.
 *
 * Fill order for 1–4 creator types:
 *   1 → right
 *   2 → right, left
 *   3 → right, left, top
 *   4 → right, left, top, bottom
 *
 * source = 'self_selected' → glyph at ~60% opacity with a thin outline ring
 * source = 'practitioner' | 'case_study' → glyph at full opacity, no ring
 */
import { CSSProperties, useMemo } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { capitaliseTypeName, getCreatorTypeColor } from "@/lib/creatorTypes";
import { glyphMarkForType } from "@/lib/game/glyphs";
import LotusFrame, { PetalKey } from "@/components/community/LotusFrame";

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
  /** Explicit pixel size; overrides the `size` bucket when provided. */
  sizePx?: number;
  onClick?: () => void;
  className?: string;
  featuredHighlight?: FeaturedHighlight;
  featuredColor?: string;
}


const SIZE_PX: Record<NonNullable<LotusProfileProps["size"]>, number> = {
  sm: 150,
  md: 180,
  lg: 210,
  xl: 240,
};


const GOLD = "#c9a04a";

type CardinalKey = Extract<PetalKey, "top" | "right" | "bottom" | "left">;

// Position of each cardinal petal centre (for glyph placement), as % of bbox.
const CARDINAL_POS: Record<CardinalKey, { x: number; y: number }> = {
  top: { x: 50, y: 18 },
  right: { x: 82, y: 50 },
  bottom: { x: 50, y: 82 },
  left: { x: 18, y: 50 },
};

const FILL_ORDER: CardinalKey[][] = [
  [],
  ["right"],
  ["right", "left"],
  ["right", "left", "top"],
  ["right", "left", "top", "bottom"],
];

function petalColor(type: string): string {
  return getCreatorTypeColor(type);
}


export function LotusProfile({
  avatarUrl,
  displayName,
  creatorTypes,
  size = "md",
  sizePx,
  onClick,
  className,
  featuredHighlight = null,
  featuredColor,
}: LotusProfileProps) {
  const px = sizePx ?? SIZE_PX[size];
  const interactive = typeof onClick === "function";


  const slots = useMemo(() => {
    const types = creatorTypes.slice(0, 4);
    const order = FILL_ORDER[types.length] ?? [];
    const map: Partial<Record<CardinalKey, LotusCreatorType>> = {};
    order.forEach((key, i) => {
      map[key] = types[i];
    });
    return map;
  }, [creatorTypes]);

  const petalFills = useMemo(() => {
    const fills: Partial<Record<PetalKey, string>> = {};
    (Object.keys(slots) as CardinalKey[]).forEach((key) => {
      const slot = slots[key];
      if (!slot) return;
      // Self-guessed types get a neutral grey petal so other players can see
      // this is a self-selected guess, not a practitioner-verified type.
      fills[key] = slot.source === "self_selected" ? "#c9cbd1" : petalColor(slot.type);
    });
    return fills;
  }, [slots]);

  const avatarPct = 46; // central avatar fills the gold ring centre circle
  const glyphSizePct = 12;

  const outerStyle: CSSProperties = { width: px, height: px };

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

      <div
        className="absolute inset-0"
        style={glowFilter ? { filter: glowFilter } : undefined}
      >
        <LotusFrame
          petalFills={petalFills}
          className="absolute inset-0 w-full h-full"
        />
      </div>

      {/* Cardinal glyphs */}
      {(Object.keys(CARDINAL_POS) as CardinalKey[]).map((key) => {
        const slot = slots[key];
        if (!slot) return null;
        const pos = CARDINAL_POS[key];
        const glyph = glyphMarkForType(capitaliseTypeName(slot.type));
        if (!glyph) return null;
        const muted = slot.source === "self_selected";
        const glyphPx = glyphSizePct * (px / 100);
        const ringPx = glyphPx * 1.55;
        return (
          <div key={`glyph-${key}`} className="pointer-events-none">
            {/* Guessed (self_selected) types are indicated by the muted glyph opacity below — no outline ring. */}
            <img
              src={glyph}
              alt=""
              aria-hidden
              draggable={false}
              style={{
                position: "absolute",
                width: `${glyphPx}px`,
                height: `${glyphPx}px`,
                left: `${pos.x * (px / 100) - glyphPx / 2}px`,
                top: `${pos.y * (px / 100) - glyphPx / 2}px`,
                opacity: muted ? 0.85 : 1,
                filter: "brightness(0) invert(1) drop-shadow(0 1px 2px rgba(0,0,0,0.55))",
              }}
            />
          </div>
        );
      })}

      {/* Central avatar */}
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
