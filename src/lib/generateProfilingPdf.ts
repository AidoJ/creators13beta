import jsPDF from "jspdf";

const PHOTO_ORDER = [
  { key: "face_front_closed", label: "Face Front" },
  { key: "face_front_smiling", label: "Face Smiling" },
  { key: "face_side", label: "Face Side" },
  { key: "body_front", label: "Body Front" },
  { key: "body_back", label: "Body Back" },
  { key: "body_side", label: "Body Side" },
  { key: "feet", label: "Feet" },
  { key: "hands", label: "Hands" },
] as const;

const FACE_KEYS = ["face_front_closed", "face_front_smiling", "face_side"] as const;
const DETAIL_KEYS = ["feet", "hands"] as const;
const BODY_KEYS = ["body_front", "body_back", "body_side"] as const;

const GENERIC_FALLBACK: Record<string, string> = {
  face_front_closed: "photo_1",
  face_front_smiling: "photo_2",
  face_side: "photo_3",
  body_front: "photo_4",
  body_back: "photo_5",
  body_side: "photo_6",
  feet: "photo_7",
  hands: "photo_8",
};

type PhotoKey = (typeof PHOTO_ORDER)[number]["key"];
type SubjectBounds = { left: number; right: number; top: number; bottom: number };
type CropRect = { left: number; top: number; width: number; height: number };

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${url}`));
    img.src = url;
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function colorDistance(a: [number, number, number], b: [number, number, number]) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

function percentile(values: number[], q: number) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * q)));
  return values[index];
}

function getPhotoLabel(key: PhotoKey) {
  return PHOTO_ORDER.find((photo) => photo.key === key)?.label ?? key;
}

function detectSubjectBounds(img: HTMLImageElement): SubjectBounds | null {
  const scale = Math.min(1, 900 / img.naturalHeight);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const edgeSampleW = Math.max(4, Math.round(width * 0.04));
  const edgeSampleH = Math.max(4, Math.round(height * 0.04));
  const startY = Math.max(2, Math.round(height * 0.03));
  const endY = Math.min(height - 2, Math.round(height * 0.97));
  const startX = Math.max(2, Math.round(width * 0.14));
  const endX = Math.min(width - 2, Math.round(width * 0.86));
  const stepY = Math.max(1, Math.round(height / 280));
  const stepX = Math.max(1, Math.round(width / 240));
  const threshold = 38;
  const minRowSpan = width * 0.08;
  const minColSpan = height * 0.38;
  const lefts: number[] = [];
  const rights: number[] = [];
  const tops: number[] = [];
  const bottoms: number[] = [];

  const pixelAt = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]] as const;
  };

  const averageHorizontalEdge = (start: number, end: number, y: number): [number, number, number] => {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;

    for (let x = start; x < end; x += 1) {
      const [r, g, b, alpha] = pixelAt(x, y);
      if (alpha < 10) continue;
      red += r;
      green += g;
      blue += b;
      count += 1;
    }

    if (!count) return [0, 0, 0];
    return [red / count, green / count, blue / count];
  };

  const averageVerticalEdge = (x: number, start: number, end: number): [number, number, number] => {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;

    for (let y = start; y < end; y += 1) {
      const [r, g, b, alpha] = pixelAt(x, y);
      if (alpha < 10) continue;
      red += r;
      green += g;
      blue += b;
      count += 1;
    }

    if (!count) return [0, 0, 0];
    return [red / count, green / count, blue / count];
  };

  for (let y = startY; y < endY; y += stepY) {
    const leftBg = averageHorizontalEdge(0, edgeSampleW, y);
    const rightBg = averageHorizontalEdge(width - edgeSampleW, width, y);

    let left = 0;
    while (left < width / 2) {
      const [r, g, b, alpha] = pixelAt(left, y);
      if (alpha > 10 && colorDistance([r, g, b], leftBg) > threshold) break;
      left += 1;
    }

    let right = width - 1;
    while (right > width / 2) {
      const [r, g, b, alpha] = pixelAt(right, y);
      if (alpha > 10 && colorDistance([r, g, b], rightBg) > threshold) break;
      right -= 1;
    }

    if (right - left > minRowSpan) {
      lefts.push(left);
      rights.push(right);
    }
  }

  for (let x = startX; x < endX; x += stepX) {
    const topBg = averageVerticalEdge(x, 0, edgeSampleH);
    const bottomBg = averageVerticalEdge(x, height - edgeSampleH, height);

    let top = 0;
    while (top < height / 2) {
      const [r, g, b, alpha] = pixelAt(x, top);
      if (alpha > 10 && colorDistance([r, g, b], topBg) > threshold) break;
      top += 1;
    }

    let bottom = height - 1;
    while (bottom > height / 2) {
      const [r, g, b, alpha] = pixelAt(x, bottom);
      if (alpha > 10 && colorDistance([r, g, b], bottomBg) > threshold) break;
      bottom -= 1;
    }

    if (bottom - top > minColSpan) {
      tops.push(top);
      bottoms.push(bottom);
    }
  }

  if (!lefts.length || !rights.length || !tops.length || !bottoms.length) return null;

  lefts.sort((a, b) => a - b);
  rights.sort((a, b) => a - b);
  tops.sort((a, b) => a - b);
  bottoms.sort((a, b) => a - b);

  const left = percentile(lefts, 0.02);
  const right = percentile(rights, 0.98);
  const top = percentile(tops, 0.02);
  const bottom = percentile(bottoms, 0.98);

  if (right <= left || bottom <= top) return null;

  return {
    left: left / scale,
    right: right / scale,
    top: top / scale,
    bottom: bottom / scale,
  };
}

function getTrimmedSubjectCrop(img: HTMLImageElement): CropRect | null {
  const bounds = detectSubjectBounds(img);
  if (!bounds) return null;

  const spanW = Math.max(1, bounds.right - bounds.left);
  const spanH = Math.max(1, bounds.bottom - bounds.top);
  const paddingX = Math.max(40, spanW * 0.14);
  const paddingTop = Math.max(24, spanH * 0.06);
  const paddingBottom = Math.max(40, spanH * 0.1);

  const left = clamp(bounds.left - paddingX, 0, img.naturalWidth);
  const right = clamp(bounds.right + paddingX, 0, img.naturalWidth);
  const top = clamp(bounds.top - paddingTop, 0, img.naturalHeight);
  const bottom = clamp(bounds.bottom + paddingBottom, 0, img.naturalHeight);

  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function drawContainedImage(
  doc: jsPDF,
  img: HTMLImageElement,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  sourceRect?: CropRect | null
) {
  const crop = sourceRect ?? {
    left: 0,
    top: 0,
    width: img.naturalWidth,
    height: img.naturalHeight,
  };

  const scale = Math.min(boxW / crop.width, boxH / crop.height);
  const drawW = crop.width * scale;
  const drawH = crop.height * scale;
  const offsetX = x + (boxW - drawW) / 2;
  const offsetY = y + (boxH - drawH) / 2;
  // Target ~300 DPI (≈11.8 px/mm) but cap at the source resolution to avoid upscaling.
  const targetPxPerMm = 11.8;
  const maxW = Math.max(1, Math.round(drawW * targetPxPerMm));
  const maxH = Math.max(1, Math.round(drawH * targetPxPerMm));
  const scaleToFit = Math.min(maxW / crop.width, maxH / crop.height, 1);
  const canvasW = Math.max(1, Math.round(crop.width * scaleToFit));
  const canvasH = Math.max(1, Math.round(crop.height * scaleToFit));

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, crop.left, crop.top, crop.width, crop.height, 0, 0, canvasW, canvasH);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  doc.addImage(dataUrl, "JPEG", offsetX, offsetY, drawW, drawH, undefined, "SLOW");
}

function formatUploadDate(date: Date): string {
  const day = date.getDate();
  const suffix = day > 3 && day < 21 ? "th" : ["th", "st", "nd", "rd"][day % 10] || "th";
  const month = date.toLocaleString("en-AU", { month: "long" });
  const year = date.getFullYear();
  return `${day}${suffix} ${month} ${year}`;
}

function buildHeaderText(subjectName?: string, uploadDate?: Date, pageLabel?: string) {
  const parts: string[] = [];
  if (subjectName) parts.push(subjectName);
  if (uploadDate) parts.push(formatUploadDate(uploadDate));
  if (pageLabel) parts.push(pageLabel);
  return parts.join("  —  ");
}

function drawHeader(doc: jsPDF, margin: number, subjectName?: string, uploadDate?: Date, pageLabel?: string) {
  const parts: string[] = [];
  if (subjectName) parts.push(subjectName);
  if (uploadDate) parts.push(formatUploadDate(uploadDate));
  const prefix = parts.join("  —  ");

  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);

  let cursorX = margin;
  const y = margin + 5;

  if (prefix) {
    doc.text(prefix, cursorX, y);
    cursorX += doc.getTextWidth(prefix);
  }

  if (pageLabel) {
    const separator = prefix ? "  —  " : "";
    if (separator) {
      doc.text(separator, cursorX, y);
      cursorX += doc.getTextWidth(separator);
    }
    // Render as a clickable link
    doc.setTextColor(30, 100, 180);
    doc.textWithLink(pageLabel, cursorX, y, { url: "https://www.13creators.com" });
    doc.setTextColor(60, 60, 60);
  }

  return margin + 10;
}

function drawOverviewPage(
  doc: jsPDF,
  images: Partial<Record<PhotoKey, HTMLImageElement>>,
  subjectName?: string,
  uploadDate?: Date
) {
  const pageW = 297;
  const pageH = 210;
  const margin = 12;
  const gap = 4;
  const topY = drawHeader(doc, margin, subjectName, uploadDate, "Uploaded via www.13creators.com");
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin - topY;

  // Top row: 3 face photos
  const faceRowH = contentH * 0.55;
  const facePhotoW = (contentW - gap * 2) / 3;

  FACE_KEYS.forEach((key, index) => {
    const image = images[key];
    if (!image) return;
    const x = margin + index * (facePhotoW + gap);
    drawContainedImage(doc, image, x, topY, facePhotoW, faceRowH);
  });

  // Bottom row: feet + hands
  const detailRowH = contentH - faceRowH - gap;
  const detailPhotoW = (contentW - gap) / 2;

  DETAIL_KEYS.forEach((key, index) => {
    const image = images[key];
    if (!image) return;
    const x = margin + index * (detailPhotoW + gap);
    drawContainedImage(doc, image, x, topY + faceRowH + gap, detailPhotoW, detailRowH);
  });
}

function drawBodyPage(
  doc: jsPDF,
  images: Partial<Record<PhotoKey, HTMLImageElement>>,
  subjectName?: string,
  uploadDate?: Date
) {
  const pageW = 297;
  const pageH = 210;
  const margin = 12;
  const gap = 4;
  const topY = drawHeader(doc, margin, subjectName, uploadDate, "Uploaded via www.13creators.com");
  const contentW = pageW - margin * 2;
  const contentH = pageH - margin - topY;
  const photoW = (contentW - gap * 2) / 3;

  BODY_KEYS.forEach((key, index) => {
    const image = images[key];
    if (!image) return;
    const x = margin + index * (photoW + gap);
    drawContainedImage(doc, image, x, topY, photoW, contentH, getTrimmedSubjectCrop(image));
  });
}

export async function generateProfilingPdf(
  photoMap: Record<string, string>,
  subjectName?: string,
  uploadDate?: Date
): Promise<Blob> {
  const resolve = (key: PhotoKey) => photoMap[key] || photoMap[GENERIC_FALLBACK[key]] || null;

  const loadTasks: { key: PhotoKey; url: string }[] = [];
  for (const photo of PHOTO_ORDER) {
    const url = resolve(photo.key);
    if (url) loadTasks.push({ key: photo.key, url });
  }

  const images: Partial<Record<PhotoKey, HTMLImageElement>> = {};
  await Promise.allSettled(
    loadTasks.map(async ({ key, url }) => {
      const img = await loadImage(url);
      images[key] = img;
    })
  );

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Page 1: faces + hands/feet
  drawOverviewPage(doc, images, subjectName, uploadDate);

  // Page 2: body photos
  const hasBodyPhotos = BODY_KEYS.some((key) => Boolean(images[key]));
  if (hasBodyPhotos) {
    doc.addPage("a4", "landscape");
    drawBodyPage(doc, images, subjectName, uploadDate);
  }

  return doc.output("blob");
}
