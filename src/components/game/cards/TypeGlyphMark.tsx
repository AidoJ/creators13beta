/**
 * Renders a Creator-Type glyph as a white silhouette overlay.
 * The `glyph` prop should be a pre-processed silhouette PNG
 * (transparent background, white icon only — no hex tile/border).
 * Get one from glyphMarkForType() in @/lib/game/glyphs.
 */
interface Props {
  glyph: string;
  size: number;
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function TypeGlyphMark({ glyph, size, opacity = 0.9, className, style }: Props) {
  return (
    <img
      src={glyph}
      alt=""
      aria-hidden
      draggable={false}
      className={`pointer-events-none select-none ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        opacity,
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
        ...style,
      }}
    />
  );
}

/** Strip a trailing " Creator" from a card name for display. */
export function displayCardName(name: string): string {
  return name.replace(/\s+Creator$/i, "");
}
