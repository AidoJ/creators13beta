/**
 * LotusFrame — native SVG 8-petal lotus.
 *
 * Two petal silhouettes:
 *   - Cardinal (top/right/bottom/left): long, pointed almond, full creator-type fill
 *   - Diagonal (NE/SE/SW/NW): shorter, narrower almond rendered behind the
 *     cardinals so only its tip peeks out between adjacent cardinal petals.
 *
 * Both shapes share the same gold outline and stroke weight to match the
 * watercolour reference lotus.
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

// Cardinal petal — rounded leaf/teardrop pointing up with a slight scalloped
// tip, matching the watercolour reference. Base sits just below the avatar
// circle (centre 100,100), tip near the top edge.
const CARDINAL_PATH =
  "M 100 104 " +
  "C 74 100 60 70 76 30 " +
  "C 84 18 92 12 100 6 " +
  "C 108 12 116 18 124 30 " +
  "C 140 70 126 100 100 104 Z";

// Diagonal petal — narrower leaf rendered behind the cardinals so only the
// tip peeks out between adjacent cardinal petals. Slightly shorter reach.
const DIAGONAL_PATH =
  "M 100 102 " +
  "C 84 98 76 70 88 36 " +
  "C 92 26 96 20 100 16 " +
  "C 104 20 108 26 112 36 " +
  "C 124 70 116 98 100 102 Z";

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
  strokeWidth = 2.25,
  centerFill = "transparent",
  className,
  style,
}: LotusFrameProps) {
  // Render order: diagonals (background) first so cardinal petals visually sit
  // on top of them — the diagonal tips peek out between cardinals.
  const order: PetalKey[] = [
    "top-left", "top-right", "bottom-left", "bottom-right",
    "top", "right", "bottom", "left",
  ];

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      aria-hidden
    >
      {order.map((key) => {
        const isCardinal = CARDINAL_KEYS.includes(key);
        const fill = petalFills[key] ?? "transparent";
        return (
          <path
            key={key}
            id={`petal-${key}`}
            d={isCardinal ? CARDINAL_PATH : DIAGONAL_PATH}
            transform={`rotate(${PETAL_ANGLES[key]} 100 100)`}
            fill={fill}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

export default LotusFrame;
