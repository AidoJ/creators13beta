/**
 * Renders a Creator-Type glyph as a solid white silhouette
 * using a CSS mask. Used to overlay the type identity on the
 * coloured halves of animal / sky-creature cards.
 */
interface Props {
  glyph: string;
  size: number;
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function TypeGlyphMark({ glyph, size, opacity = 0.78, className, style }: Props) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none ${className ?? ""}`}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        background: "#ffffff",
        opacity,
        WebkitMaskImage: `url(${glyph})`,
        maskImage: `url(${glyph})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
        ...style,
      }}
    />
  );
}

/** Strip a trailing " Creator" from a card name for display. */
export function displayCardName(name: string): string {
  return name.replace(/\s+Creator$/i, "");
}
