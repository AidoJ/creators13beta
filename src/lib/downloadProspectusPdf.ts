import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} timed out`)), ms))]);

/**
 * Builds the prospectus PDF from the pages on screen.
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
