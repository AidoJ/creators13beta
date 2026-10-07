import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { CANVAS_H, CANVAS_W } from "@/lib/prospectusCanvas";

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))]);

/**
 * Builds the prospectus PDF from an unscaled clone of the saved pages.
 * iPad/iPhone Safari caps canvas memory, so a 2x render of six A4 pages
 * stalls there forever; we render at a device-safe scale, time-limit each
 * page, and on iOS open the file (Safari ignores programmatic downloads).
 */
export async function downloadProspectusPdf() {
  const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-prospectus-page]"));
  if (!pages.length) throw new Error("The prospectus pages are not ready yet.");
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const scale = isIOS ? 1.25 : Math.min(2, window.devicePixelRatio || 1.5);
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage("a4", "landscape");
    const canvas = await withTimeout(html2canvas(pages[index], {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000,
      // Capture design coordinates, never the responsive screen transform:
      // html2canvas clips transformed children against their unscaled bounds.
      width: CANVAS_W,
      height: CANVAS_H,
      onclone: (clonedDocument, clonedPage) => {
        Object.assign(clonedPage.style, {
          width: `${CANVAS_W}px`, height: `${CANVAS_H}px`,
          minWidth: `${CANVAS_W}px`, maxWidth: "none",
          aspectRatio: "auto", transform: "none", boxShadow: "none",
        });
        const stage = clonedPage.querySelector<HTMLElement>(".prospectus-canvas");
        if (stage) stage.style.transform = "none";
        // Resolve container-query typography to px in the browser before
        // html2canvas parses it (also supports the structured fallback pages).
        for (const node of [clonedPage, ...Array.from(clonedPage.querySelectorAll<HTMLElement>("*"))]) {
          const computed = clonedDocument.defaultView?.getComputedStyle(node);
          if (!computed) continue;
          const values = Array.from(computed, (property) => [property, computed.getPropertyValue(property)]);
          for (const [property, value] of values) node.style.setProperty(property, value);
        }
      },
    }), 40000, `Page ${index + 1}`);
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 297, 210, undefined, "FAST");
    canvas.width = canvas.height = 0; // free memory before the next page
  }
  const name = "13CREATORS-Practitioner-Prospectus.pdf";
  if (isIOS) {
    const url = URL.createObjectURL(pdf.output("blob"));
    window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } else {
    pdf.save(name);
  }
}
