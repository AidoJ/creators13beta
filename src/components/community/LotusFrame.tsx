/**
 * LotusFrame — native SVG 8-petal lotus.
 *
 * Each petal is its own <path> element with a stable id and can be individually
 * filled via the `petalFills` prop. The gold outline matches the original
 * lotus-frame.png art direction.
 *
 * Petal keys (clockwise from 12 o'clock):
 *   top, top-right, right, bottom-right, bottom, bottom-left, left, top-left
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

// A single petal path pointing UP, centred horizontally at x=100,
// with its base at the centre (100,100) and tip near the top edge.
// Almond / teardrop with a soft curve.
const PETAL_PATH =
  "M 100 100 C 70 80 70 40 100 8 C 130 40 130 80 100 100 Z";

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
  strokeWidth = 2,
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
      {/* Render diagonals first so cardinals visually sit on top. */}
      {(["top-left", "top-right", "bottom-left", "bottom-right", "top", "right", "bottom", "left"] as PetalKey[]).map(
        (key) => {
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
            />
          );
        }
      )}
      {/* Centre circle */}
      <circle
        cx="100"
        cy="100"
        r="22"
        fill={centerFill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

export default LotusFrame;
