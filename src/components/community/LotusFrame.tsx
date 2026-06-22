/**
 * LotusFrame — native SVG 8-petal lotus.
 *
 * One petal path spans exactly 45° and shares its base points with its
 * neighbours, so when rotated 8× around the centre the petal edges TOUCH
 * (no gaps, no separate floating PNGs). A gold ring then overdraws all
 * petal bases at the same radius.
 *
 * Cardinal petals (top/right/bottom/left) carry the creator-type fill.
 * Diagonal petals (NE/SE/SW/NW) are always transparent so the page
 * background shows through.
 *
 * Geometry ported from public/lotus-community.html (viewBox 720) and
 * scaled to viewBox 200 by ×(200/720) about centre (100,100).
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

const PETAL_ANGLES: Record<PetalKey, number> = {
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

// Single petal spanning 45° — its two base points are shared with the
// neighbouring petals so the lotus closes around the centre ring.
// Centre is (100,100); the petal points "up" (cardinal "top" position).
const PETAL_PATH =
  "M 83.00 58.94 " +
  "C 79.44 49.44, 76.67 40.28, 79.72 33.06 " +
  "C 83.06 26.11, 92.50 26.39, 100.00 20.00 " +
  "C 107.50 26.39, 116.94 26.11, 120.28 33.06 " +
  "C 123.33 40.28, 120.56 49.44, 117.00 58.94";

// Centre ring radius (gold). Matches r=164 in the 720 mockup.
const CENTER_R = 45.56;

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
  strokeWidth = 1.6,
  centerFill = "transparent",
  className,
  style,
}: LotusFrameProps) {
  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden
    >
      {/* Petals — diagonals first (so any subtle overlap reads cleanly),
          then cardinals on top. All share the same gold outline. */}
      {PETAL_KEYS.filter((k) => !CARDINAL_KEYS.includes(k))
        .concat(CARDINAL_KEYS)
        .map((key) => {
          const fill = petalFills[key] ?? "transparent";
          return (
            <path
              key={key}
              id={`petal-${key}`}
              d={PETAL_PATH}
              transform={`rotate(${PETAL_ANGLES[key]} 100 100)`}
              fill={fill}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

      {/* Centre gold ring — drawn AFTER petals so it overdraws every petal
          base on a single clean circle, exactly like the mockup. */}
      <circle
        cx="100"
        cy="100"
        r={CENTER_R}
        fill={centerFill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

export default LotusFrame;
