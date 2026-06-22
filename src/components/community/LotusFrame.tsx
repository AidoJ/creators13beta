/**
 * LotusFrame — native SVG 8-petal lotus.
 *
 * One shared petal silhouette is rotated eight times around the centre,
 * matching the watercolour reference (8-fold radial symmetry, ogee/shield
 * petal with a small shoulder before a pointed tip and a wide rounded base
 * that tucks behind the centre circle).
 *
 * Render order: diagonals first, then cardinals on top — so where adjacent
 * petals overlap at the base, the cardinal (coloured) petal sits in front of
 * the diagonal (white/outline) petal. Cardinal petals receive the player's
 * Creator-Type fills; diagonals stay transparent so the gold outline reads
 * as the white/outlined background lotus from the reference.
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

// Single shared petal path. ViewBox is 0 0 200 200, centre (100,100). Petal
// points upward: tip at (100,8), wide rounded base at y≈72 (radius ≈28 from
// centre, sitting flush with the avatar circle). Mid-bulge ≈40 wide, with a
// slight ogee shoulder that gives the pointed tip its characteristic shape.
const PETAL_PATH =
  "M 100 8 " +
  "C 96 12 94 16 92 22 " +
  "C 88 28 82 36 80 48 " +
  "C 78 60 84 70 100 72 " +
  "C 116 70 122 60 120 48 " +
  "C 118 36 112 28 108 22 " +
  "C 106 16 104 12 100 8 Z";

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
  strokeWidth = 1.75,
  centerFill = "transparent",
  className,
  style,
}: LotusFrameProps) {
  // Render diagonals (background) first so cardinal petals visually sit on
  // top where they overlap at the base.
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
        const fill = isCardinal
          ? (petalFills[key] ?? "transparent")
          : "#ffffff";
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
      {/* Centre circle — sits in front of petal bases, behind avatar overlay */}
      <circle
        cx="100"
        cy="100"
        r="28"
        fill={centerFill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

export default LotusFrame;
