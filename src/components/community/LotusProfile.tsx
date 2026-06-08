/**
 * LotusProfile — reusable profile frame component (Appendix 7 of Phase 2 spec).
 *
 * Three visual states (no mixed states are possible in Phase 2.1 — the lock
 * trigger prevents self_selected + practitioner mixing, and practitioner rows
 * are overwritten in full):
 *
 *   1. Self-Profiled        — one type, source='self_selected'
 *                            → single petal, outlined / muted glyph
 *   2. Officially (Partial) — one type, source='practitioner'|'case_study'
 *                            → single petal, filled with family colour
 *   3. Officially (Full)    — 2-4 types, source='practitioner'|'case_study'
 *                            → up to 4 petals around the avatar, filled
 *
 * Petal positions for n=1..4:    top → right → bottom → left.
 *
 * If glyph SVG assets ever land in the codebase, swap the letter placeholder
 * below for a real glyph component. Sky has no family colour; it renders in
 * the neutral gold/cream palette from Appendix 1.
 */
import { CSSProperties, useMemo } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCreatorTypeColor } from "@/lib/creatorTypes";

export type LotusCreatorType = {
  type: string; // one of the 13 names, any casing
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
  sm: 60,
  md: 100,
  lg: 160,
  xl: 240,
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

function initial(name: string): string {
  return name.charAt(0).toUpperCase();
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

  // Determine state. If any type is officially assigned, treat the whole row
  // as "official" (we don't mix sources within a single profile per spec).
  const isOfficial = creatorTypes.some(
    (t) => t.source === "practitioner" || t.source === "case_study"
  );

  // Pad to 4 slots so the layout is stable. Empty slots render as outlined.
  const slots = useMemo(() => {
    const filled = creatorTypes.slice(0, 4);
    const out: Array<LotusCreatorType | null> = [...filled];
    while (out.length < 4) out.push(null);
    return out;
  }, [creatorTypes]);

  // Sizing within the SVG viewBox (100x100).
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
        {/* Petals */}
        {slots.map((slot, i) => {
          const pos = POSITIONS[i];
          const cx = 50 + pos.x * orbit;
          const cy = 50 + pos.y * orbit;
          if (!slot) {
            // Empty lotus position — faint outline only.
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
          const filled = isOfficial; // self-selected → muted; official → filled
          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={petalR}
                fill={filled ? color : "transparent"}
                stroke={color}
                strokeWidth={filled ? 0 : 2}
                opacity={filled ? 1 : 0.85}
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={petalR * 1.05}
                fontFamily="'Lilita One', 'Questrial', sans-serif"
                fill={filled ? "#fff" : color}
                style={{ pointerEvents: "none" }}
              >
                {initial(slot.type)}
              </text>
            </g>
          );
        })}
      </svg>

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
        ) : displayName ? (
          <span
            className="font-display text-foreground/80"
            style={{ fontSize: Math.max(12, px * 0.16) }}
          >
            {initial(displayName)}
          </span>
        ) : (
          <User className="w-1/2 h-1/2 text-muted-foreground" />
        )}
      </div>

      {/* Match score badge */}
      {typeof matchScore === "number" && (
        <div
          className="absolute -bottom-1 -right-1 rounded-full bg-primary text-primary-foreground font-display flex items-center justify-center shadow-md ring-2 ring-background"
          style={{
            width: Math.max(20, px * 0.26),
            height: Math.max(20, px * 0.26),
            fontSize: Math.max(10, px * 0.13),
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
