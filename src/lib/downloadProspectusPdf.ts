import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { CANVAS_H, CANVAS_W } from "@/lib/prospectusCanvas";

/** Storage location of the admin-generated prospectus (bucket `prospectus-assets`). */
export const PROSPECTUS_PDF_PATH = "generated/prospectus.pdf";
export const PROSPECTUS_META_PATH = "generated/prospectus.json";
export const PROSPECTUS_FILE_NAME = "13CREATORS-Practitioner-Prospectus.pdf";
export const PER_PAGE_LIMIT_MS = 180_000;

export type ProspectusPdfMeta = { generated_at: string; size: number; pages: number; content_hash: string; longest_page_ms: number; total_ms: number };

const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${what} took longer than ${Math.round(ms / 1000)} seconds`)), ms))]);

/** Captures one prospectus page at its unscaled 1123x794 design size as a JPEG data URL. */
export async function capturePage(page: HTMLElement, label: string, limitMs = PER_PAGE_LIMIT_MS): Promise<string> {
  const canvas = await withTimeout(html2canvas(page, {
    scale: 1.5,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    imageTimeout: 60000,
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
      // Resolve container-query sizes to px (only size props; copying all ~350 stalled iPad Safari).
      const SIZE_PROPS = ["font-size", "line-height", "letter-spacing", "padding", "margin", "gap", "border-radius", "border-width", "width", "height", "top", "left"];
      const view = clonedDocument.defaultView;
      for (const node of [clonedPage, ...Array.from(clonedPage.querySelectorAll<HTMLElement>("*"))]) {
        const computed = view?.getComputedStyle(node);
        if (!computed) continue;
        for (const property of SIZE_PROPS) {
          const value = computed.getPropertyValue(property);
          if (value) node.style.setProperty(property, value);
        }
      }
    },
  }), limitMs, label);
  const url = canvas.toDataURL("image/jpeg", 0.85);
  canvas.width = canvas.height = 0;
  return url;
}

export function assemblePdf(images: string[]): Blob {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  images.forEach((img, i) => {
    if (i > 0) pdf.addPage("a4", "landscape");
    pdf.addImage(img, "JPEG", 0, 0, 297, 210, undefined, "FAST");
  });
  return pdf.output("blob");
}

/** Fingerprint of the saved prospectus content, used to flag a stale stored PDF. */
export async function prospectusContentHash(): Promise<string> {
  const { data } = await supabase.from("prospectus_sections" as any).select("id, sort_order, layout_key, heading, body, image_urls, canvas_layout").order("sort_order");
  const bytes = new TextEncoder().encode(JSON.stringify(data ?? []));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class ProspectusNotReady extends Error {}

/** Member download: serves the stored PDF only. Never builds on the member's device. */
export async function downloadProspectusPdf() {
  const { data, error } = await supabase.functions.invoke("prospectus-pdf", { body: {} });
  if (error || !data?.url) throw new ProspectusNotReady("The prospectus isn't ready yet, please try again later.");
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) { window.location.href = data.url; return; }
  const a = document.createElement("a");
  a.href = data.url; a.download = PROSPECTUS_FILE_NAME; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
}
