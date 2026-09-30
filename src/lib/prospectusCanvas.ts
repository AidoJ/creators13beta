import DOMPurify from "dompurify";

/** Design space for a landscape A4 prospectus page (297 x 210 mm). */
export const CANVAS_W = 1123;
export const CANVAS_H = 794;

export type CanvasElement = {
  id: string;
  type: "text" | "image" | "box";
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  /** text: rich HTML (inline images keep data-storage-path) */
  html?: string;
  /** image: private storage path */
  path?: string;
  fit?: "cover" | "contain";
  bg?: string;
  radius?: number;
  padding?: number;
  opacity?: number;
};

export type CanvasLayout = {
  bg: string;
  bgPath?: string;
  elements: CanvasElement[];
};

/** First section row of each page stores that page's canvas. */
export const PAGE_PRIMARY_KEYS = ["cover", "why", "journey", "training", "qa", "contact"] as const;

export const newId = () => Math.random().toString(36).slice(2, 10);

export function sanitizeCanvasHtml(html = ""): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["style", "data-storage-path", "crossorigin"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input"],
  });
}

export function isCanvas(value: unknown): value is CanvasLayout {
  return !!value && typeof value === "object" && Array.isArray((value as CanvasLayout).elements) && (value as CanvasLayout).elements.length > 0;
}

/** All storage paths referenced by a canvas (images, background, inline images). */
export function canvasPaths(layout: CanvasLayout | null | undefined): string[] {
  if (!layout) return [];
  const paths: string[] = [];
  if (layout.bgPath) paths.push(layout.bgPath);
  for (const el of layout.elements) {
    if (el.path) paths.push(el.path);
    if (el.html) for (const m of el.html.matchAll(/data-storage-path=["']([^"']+)["']/g)) paths.push(m[1]);
  }
  return paths;
}

/** Swap inline image src for fresh signed URLs (stored src may be expired). */
export function signInlineHtml(html: string, signed: Record<string, string>): string {
  const box = document.createElement("div");
  box.innerHTML = html;
  box.querySelectorAll<HTMLImageElement>("img[data-storage-path]").forEach((img) => {
    const url = signed[img.dataset.storagePath ?? ""];
    if (url) img.src = url;
    img.setAttribute("crossorigin", "anonymous");
  });
  return box.innerHTML;
}

/** Strip signed URLs before saving so only storage paths persist. */
export function stripInlineHtml(html: string): string {
  const box = document.createElement("div");
  box.innerHTML = html;
  box.querySelectorAll<HTMLImageElement>("img[data-storage-path]").forEach((img) => img.setAttribute("src", ""));
  return box.innerHTML;
}

const TEXT_PROPS = ["font-size", "font-weight", "font-style", "color", "line-height", "text-align", "font-family", "letter-spacing", "text-transform"];

function inlineStyles(source: Element, clone: Element) {
  const cs = getComputedStyle(source);
  const style = TEXT_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(";");
  (clone as HTMLElement).setAttribute("style", style);
  const srcKids = Array.from(source.children);
  const cloneKids = Array.from(clone.children);
  srcKids.forEach((kid, i) => cloneKids[i] && inlineStyles(kid, cloneKids[i]));
}

function isTransparent(color: string) {
  return !color || color === "transparent" || /rgba\([^)]*,\s*0\)$/.test(color);
}

/**
 * Convert a rendered structured page (at CANVAS_W width) into free-form elements,
 * so the builder starts from the current design instead of a blank page.
 */
export function seedFromPage(page: HTMLElement, urlToPath: Record<string, string>): CanvasLayout {
  const origin = page.getBoundingClientRect();
  const scale = CANVAS_W / origin.width;
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round((r.left - origin.left) * scale), y: Math.round((r.top - origin.top) * scale), w: Math.max(20, Math.round(r.width * scale)), h: Math.max(20, Math.round(r.height * scale)) };
  };
  const elements: CanvasElement[] = [];
  let z = 1;
  // Coloured panels
  page.querySelectorAll("aside, article, .prospectus-learning, .prospectus-contact-card").forEach((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    if (!isTransparent(bg)) elements.push({ id: newId(), type: "box", ...rect(el), z: z++, bg, radius: parseFloat(getComputedStyle(el).borderRadius) || 0 });
  });
  page.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    const path = urlToPath[src];
    if (!path || img.closest(".prospectus-copy")) return;
    elements.push({ id: newId(), type: "image", ...rect(img), z: z++, path, fit: getComputedStyle(img).objectFit === "cover" ? "cover" : "contain" });
  });
  // Text: headings and leaf text blocks
  const textNodes = Array.from(page.querySelectorAll("h1, h2, h3, .prospectus-copy, .prospectus-cover-quotes > div, .prospectus-qa-list > div, .prospectus-cover-main > div > div, .prospectus-learning, footer"));
  const chosen = textNodes.filter((el) => !textNodes.some((other) => other !== el && other.contains(el)) && el.textContent?.trim());
  for (const el of chosen) {
    const clone = el.cloneNode(true) as HTMLElement;
    inlineStyles(el, clone);
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const r = rect(el);
    elements.push({ id: newId(), type: "text", ...r, h: r.h + 6, z: z++, html: sanitizeCanvasHtml(clone.outerHTML), bg: isTransparent(bg) ? undefined : bg, radius: parseFloat(cs.borderRadius) || 0 });
  }
  return { bg: getComputedStyle(page).backgroundColor || "#ffffff", elements };
}
