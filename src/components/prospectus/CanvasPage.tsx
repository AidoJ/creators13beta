import { useEffect, useRef, useState } from "react";
import { CANVAS_H, CANVAS_W, sanitizeCanvasHtml, signInlineHtml, type CanvasElement, type CanvasLayout } from "@/lib/prospectusCanvas";

/** Scale factor so a 1123px design fits its container width. */
export function useCanvasScale() {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / CANVAS_W));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return { ref, scale };
}

export function elementStyle(el: CanvasElement): React.CSSProperties {
  return {
    background: el.type !== "image" ? el.bg : undefined,
    borderRadius: el.radius ? `${el.radius}px` : undefined,
    padding: el.padding ? `${el.padding}px` : undefined,
    opacity: el.opacity ?? 1,
  };
}

export function ElementContent({ el, signed }: { el: CanvasElement; signed: Record<string, string> }) {
  if (el.type === "image") {
    const src = el.path ? signed[el.path] : "";
    return src ? <img src={src} crossOrigin="anonymous" alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: el.fit ?? "cover", borderRadius: el.radius ? `${el.radius}px` : undefined, display: "block" }} /> : <div className="prospectus-canvas-missing">Picture</div>;
  }
  if (el.type === "text") return <div className="prospectus-canvas-text" dangerouslySetInnerHTML={{ __html: sanitizeCanvasHtml(signInlineHtml(el.html ?? "", signed)) }} />;
  return null;
}

export function canvasBackground(layout: CanvasLayout, signed: Record<string, string>): React.CSSProperties {
  const url = layout.bgPath ? signed[layout.bgPath] : "";
  return { background: layout.bg, backgroundImage: url ? `url(${url})` : undefined, backgroundSize: "cover", backgroundPosition: "center" };
}

/** Read-only render of a free-form page; used on the public page and in the PDF. */
export default function CanvasPage({ page, layout, signed }: { page: number; layout: CanvasLayout; signed: Record<string, string> }) {
  const { ref, scale } = useCanvasScale();
  return <section ref={ref} data-prospectus-page={page} className="prospectus-page">
    <div className="prospectus-canvas" style={{ width: CANVAS_W, height: CANVAS_H, transform: `scale(${scale})`, ...canvasBackground(layout, signed) }}>
      {[...layout.elements].sort((a, b) => a.z - b.z).map((el) => <div key={el.id} style={{ position: "absolute", left: el.x, top: el.y, width: el.w, height: el.h, zIndex: el.z, overflow: "hidden", ...elementStyle(el) }}>
        <ElementContent el={el} signed={signed} />
      </div>)}
    </div>
  </section>;
}
