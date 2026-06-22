/**
 * LotusFrame — native SVG 8-petal lotus.
 *
 * This ports public/lotus-community.html directly: one petal path in a 720
 * viewBox, reused at 45° rotations around the centre. The filled cardinal
 * petals sit behind the exact mockup outline; diagonals remain transparent.
 *
 * Cardinal petals (top/right/bottom/left) carry the creator-type fill.
 * Diagonal petals (NE/SE/SW/NW) are always transparent so the page
 * background shows through.
 *
 * No background is drawn here; transparent areas pick up the page background.
 */
import { CSSProperties } from "react";

export type PetalKey =
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left"
  | "top-left";

export const PETAL_KEYS: PetalKey[] = [
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
  "top-left",
];

const PETAL_ROTATION: Record<PetalKey, number> = {
  top: 0,
  "top-right": 45,
  right: 90,
  "bottom-right": 135,
  bottom: 180,
  "bottom-left": 225,
  left: 270,
  "top-left": 315,
};

const CARDINAL_KEYS: PetalKey[] = ["top", "right", "bottom", "left"];

const CENTER = 360;
const RING_R = 164;
const AVATAR_R = 138;
const PETAL_OUTLINE_PATH =
  "M 298.8 212.2 C 286 178, 276 145, 287 119 C 299 94, 333 95, 360 72 C 387 95, 421 94, 433 119 C 444 145, 434 178, 421.2 212.2";
const PETAL_FILL_PATH = `${PETAL_OUTLINE_PATH} A ${RING_R} ${RING_R} 0 0 1 298.8 212.2 Z`;

export interface LotusFrameProps {
  /** Per-petal fill colours. Missing petals render transparent. */
  petalFills?: Partial<Record<PetalKey, string>>;
  /** Outline (gold) colour. */
  strokeColor?: string;
  /** Outline stroke width in viewBox units (viewBox is 0 0 200 200). */
  strokeWidth?: number;
  /** Inner circle fill — usually 'transparent' so the avatar shows through. */
  centerFill?: string;
  /** Optional className for sizing/positioning. */
  className?: string;
  style?: CSSProperties;
}

const GOLD = "#c9a04a";

export function LotusFrame({
  petalFills = {},
  strokeColor = GOLD,
  strokeWidth = 5,
  centerFill = "transparent",
  className,
  style,
}: LotusFrameProps) {
  return (
    <svg
      viewBox="0 0 720 720"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden
    >
      {/* Cardinal fills only. Diagonal petals deliberately render no fill, so
          the actual page background shows through those four lobes. */}
      {CARDINAL_KEYS.map((key) => {
        const fill = petalFills[key];
        if (!fill) return null;
        return (
          <path
            key={`fill-${key}`}
            d={PETAL_FILL_PATH}
            transform={`rotate(${PETAL_ROTATION[key]} ${CENTER} ${CENTER})`}
            fill={fill}
            stroke="none"
          />
        );
      })}

      {/* Exact mockup outline: eight repeated open petal strokes plus the
          unbroken central ring drawn over the petal bases. */}
      <g
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      >
        {PETAL_KEYS.map((key) => (
          <path
            key={`outline-${key}`}
            d={PETAL_OUTLINE_PATH}
            transform={`rotate(${PETAL_ROTATION[key]} ${CENTER} ${CENTER})`}
          />
        ))}
      </g>

      {/* Centre gold ring — drawn AFTER petals so it overdraws every petal
          base on a single clean circle, exactly like the mockup. */}
      <circle
        cx={CENTER}
        cy={CENTER}
        r={RING_R}
        fill={centerFill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
      />

      <circle
        cx={CENTER}
        cy={CENTER}
        r={AVATAR_R}
        fill="none"
        stroke="rgba(200, 144, 42, 0.55)"
        strokeWidth={1.2}
        strokeDasharray="2 4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default LotusFrame;
