/**
 * LotusFrame — native SVG 8-petal lotus.
 *
 * Each petal is a true 45° annular sector: its side boundaries are the same
 * boundaries used by its neighbours, so the petals physically touch around
 * the avatar ring instead of floating as separate PNG-like shapes.
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

const PETAL_CENTER_ANGLES: Record<PetalKey, number> = {
  top: -90,
  "top-right": -45,
  right: 0,
  "bottom-right": 45,
  bottom: 90,
  "bottom-left": 135,
  left: 180,
  "top-left": -135,
};

const CARDINAL_KEYS: PetalKey[] = ["top", "right", "bottom", "left"];

const CENTER = 100;
const HALF_SECTOR_DEG = 22.5;
const INNER_R = 44;
const VALLEY_R = 62;
const TIP_R = 86;
const PETAL_SHOULDER = 0.56;

function polar(radius: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(radians),
    y: CENTER + radius * Math.sin(radians),
  };
}

function fmt(n: number) {
  return n.toFixed(2);
}

function petalPath(centerAngle: number) {
  const leftAngle = centerAngle - HALF_SECTOR_DEG;
  const rightAngle = centerAngle + HALF_SECTOR_DEG;
  const innerLeft = polar(INNER_R, leftAngle);
  const outerLeft = polar(VALLEY_R, leftAngle);
  const tip = polar(TIP_R, centerAngle);
  const outerRight = polar(VALLEY_R, rightAngle);
  const innerRight = polar(INNER_R, rightAngle);
  const leftShoulder = polar(TIP_R * PETAL_SHOULDER, centerAngle - 8);
  const rightShoulder = polar(TIP_R * PETAL_SHOULDER, centerAngle + 8);

  return [
    `M ${fmt(innerLeft.x)} ${fmt(innerLeft.y)}`,
    `L ${fmt(outerLeft.x)} ${fmt(outerLeft.y)}`,
    `C ${fmt(leftShoulder.x)} ${fmt(leftShoulder.y)}, ${fmt(tip.x)} ${fmt(tip.y)}, ${fmt(tip.x)} ${fmt(tip.y)}`,
    `C ${fmt(tip.x)} ${fmt(tip.y)}, ${fmt(rightShoulder.x)} ${fmt(rightShoulder.y)}, ${fmt(outerRight.x)} ${fmt(outerRight.y)}`,
    `L ${fmt(innerRight.x)} ${fmt(innerRight.y)}`,
    `A ${INNER_R} ${INNER_R} 0 0 0 ${fmt(innerLeft.x)} ${fmt(innerLeft.y)}`,
    "Z",
  ].join(" ");
}

const PETAL_PATHS: Record<PetalKey, string> = Object.fromEntries(
  PETAL_KEYS.map((key) => [key, petalPath(PETAL_CENTER_ANGLES[key])])
) as Record<PetalKey, string>;

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
              d={PETAL_PATHS[key]}
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
        r={INNER_R}
        fill={centerFill}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}

export default LotusFrame;
