/**
 * LotusProfile — reusable profile frame component (Appendix 7 of Phase 2 spec).
 *
 * Petals render the Creator-Type glyph silhouettes (from glyphMarkForType).
 * Source determines visual weight:
 *   - 'self_selected'         → filled at reduced opacity (muted)
 *   - 'practitioner'/'case_study' → filled at full opacity
 * Empty slots render as a faint dashed outline so the lotus shape stays stable.
 *
 * Avatar fallback uses a generic person silhouette (User icon) — never an
 * initial letter — so the centre can't be mistaken for a 5th petal.
 */
import { CSSProperties, useMemo } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { capitaliseTypeName, getCreatorTypeColor } from "@/lib/creatorTypes";
import { glyphMarkForType } from "@/lib/game/glyphs";

export type LotusCreatorType = {
  type: string;
  source: "self_selected" | "practitioner" | "case_study";
};

export interface LotusProfileProps {
  avatarUrl: string | null;
  displayName: string;
  creatorTypes: LotusCreatorType[];
  size?: "sm" | "md" | "lg" | "xl";
  onClick?: () => void;
  matchScore?: number; // 0-8
  className?: string;
}

const SIZE_PX: Record<NonNullable<LotusProfileProps["size"]>, number> = {
  sm: 80,
  md: 100,
  lg: 140,
  xl: 200,
};

const SKY_NEUTRAL = "#edd58a"; // Appendix 1 "Gold"
const EMPTY_PETAL = "hsl(var(--border))";

const POSITIONS: Array<{ x: number; y: number }> = [
  { x: 0, y: -1 },   // top
  { x: 1, y: 0 },    // right
  { x: 0, y: 1 },    // bottom
  { x: -1, y: 0 },   // left
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
  matchScore,
  className,
}: LotusProfileProps) {
  const px = SIZE_PX[size];

  const slots = useMemo(() => {
    const filled = creatorTypes.slice(0, 4);
    const out: Array<LotusCreatorType | null> = [...filled];
    while (out.length < 4) out.push(null);
    return out;
  }, [creatorTypes]);

  // SVG viewBox 100x100.
  const avatarR = 22;
  const petalR = 13;
  const orbit = 36;

  const interactive = typeof onClick === "function";

  return (
    <div
      className={cn(
        "relative inline-block select-none",
        interactive && "cursor-pointer transition-transform hover:scale-[1.03] active:scale-[0.98]",
        className
      )}
      style={{ width: px, height: px } satisfies CSSProperties}
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
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full overflow-visible"
        aria-hidden
      >
        {slots.map((slot, i) => {
          const pos = POSITIONS[i];
          const cx = 50 + pos.x * orbit;
          const cy = 50 + pos.y * orbit;
          if (!slot) {
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={petalR}
                fill="none"
                stroke={EMPTY_PETAL}
                strokeWidth={1}
                strokeDasharray="2 2"
                opacity={0.45}
              />
            );
          }
          const color = petalColor(slot.type);
          const muted = slot.source === "self_selected";
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={petalR}
              fill={color}
              opacity={muted ? 0.55 : 1}
            />
          );
        })}
      </svg>

      {/* Petal glyphs as foreignObject-free HTML imgs so they crisp-render */}
      {slots.map((slot, i) => {
        if (!slot) return null;
        const pos = POSITIONS[i];
        // Convert viewBox coords (cx,cy) → percent of container
        const cxPct = 50 + pos.x * orbit;
        const cyPct = 50 + pos.y * orbit;
        const glyph = glyphMarkForType(capitaliseTypeName(slot.type));
        if (!glyph) return null;
        const glyphPx = petalR * 1.6 * (px / 100);
        const muted = slot.source === "self_selected";
        return (
          <img
            key={`g-${i}`}
            src={glyph}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute"
            style={{
              width: glyphPx,
              height: glyphPx,
              left: `calc(${cxPct}% - ${glyphPx / 2}px)`,
              top: `calc(${cyPct}% - ${glyphPx / 2}px)`,
              opacity: muted ? 0.75 : 0.95,
              filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
            }}
          />
        );
      })}

      {/* Central avatar */}
      <div
        className="absolute rounded-full overflow-hidden bg-muted ring-2 ring-background flex items-center justify-center"
        style={{
          width: `${avatarR * 2}%`,
          height: `${avatarR * 2}%`,
          left: `${50 - avatarR}%`,
          top: `${50 - avatarR}%`,
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

      {/* Match score badge — small, muted, top-right */}
      {typeof matchScore === "number" && (
        <div
          className="absolute rounded-full bg-secondary text-secondary-foreground font-display flex items-center justify-center shadow-sm ring-1 ring-background"
          style={{
            width: 26,
            height: 26,
            fontSize: 12,
            top: -4,
            right: -4,
          }}
          aria-label={`Match score ${matchScore}`}
        >
          {matchScore}
        </div>
      )}
    </div>
  );
}

export default LotusProfile;
