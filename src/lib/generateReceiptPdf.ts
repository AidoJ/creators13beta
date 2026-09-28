import jsPDF from "jspdf";
import logoUrl from "@/assets/13creators-logo-full.png";

export type ReceiptItem = {
  id: string;
  kind: "payment" | "refund" | "cancellation" | "cancellation_scheduled";
  date: number;
  description: string;
  amount: number | null;
  currency: string | null;
  status: string;
  receipt_number: string | null;
  card: string | null;
  period_end: number | null;
};

export const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100);

export const formatDate = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

async function loadImage(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return { data: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
  } catch { return null; }
}

// PDFs are printed documents, so they use a fixed print palette rather than app theme tokens.
const INK: [number, number, number] = [28, 28, 32];
const MUTED: [number, number, number] = [110, 110, 118];
const GOLD: [number, number, number] = [196, 150, 60];

export async function downloadReceipt(item: ReceiptItem, customerEmail: string, customerName?: string | null) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 20;
  const isRefund = item.kind === "refund";

  // Header band
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 42, "F");
  const logo = await loadImage(logoUrl);
  if (logo) {
    const h = 26, w = Math.min(70, (logo.w / logo.h) * h);
    doc.addImage(logo.data, "PNG", M, 8, w, (w / logo.w) * logo.h > h ? h : (w / logo.w) * logo.h);
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(isRefund ? "REFUND RECEIPT" : "RECEIPT", W - M, 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Creators 13", W - M, 30, { align: "right" });

  doc.setFillColor(...GOLD);
  doc.rect(0, 42, W, 1.5, "F");

  // Meta
  let y = 60;
  const meta = (label: string, value: string, x: number) => {
    doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(11); doc.setTextColor(...INK); doc.text(value, x, y + 6);
  };
  meta("Receipt number", item.receipt_number ?? "—", M);
  meta("Date", formatDate(item.date), 85);
  meta("Status", item.status, 150);
  y += 20;
  meta("Billed to", customerName || customerEmail, M);
  if (customerName) { doc.setFontSize(9); doc.setTextColor(...MUTED); doc.text(customerEmail, M, y + 12); }
  if (item.card) meta("Paid with", item.card, 110);

  // Line table
  y += 28;
  doc.setFillColor(246, 243, 236);
  doc.rect(M, y, W - 2 * M, 10, "F");
  doc.setFontSize(9); doc.setTextColor(...MUTED); doc.setFont("helvetica", "bold");
  doc.text("DESCRIPTION", M + 4, y + 6.5);
  doc.text("AMOUNT", W - M - 4, y + 6.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  y += 18;
  doc.setFontSize(11); doc.setTextColor(...INK);
  const lines = doc.splitTextToSize(item.description, 120);
  doc.text(lines, M + 4, y);
  const amt = item.amount != null && item.currency ? formatMoney(item.amount, item.currency) : "—";
  doc.text(isRefund ? `-${amt}` : amt, W - M - 4, y, { align: "right" });
  y += lines.length * 6 + 6;
  doc.setDrawColor(220, 220, 220);
  doc.line(M, y, W - M, y);
  y += 10;
  doc.setFont("helvetica", "bold"); doc.setFontSize(13);
  doc.text(isRefund ? "Total refunded" : "Total paid", W - M - 60, y);
  doc.setTextColor(...GOLD);
  doc.text(isRefund ? `-${amt}` : amt, W - M - 4, y, { align: "right" });

  // Footer
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...MUTED);
  doc.text("Thank you for being part of Creators 13.", W / 2, 270, { align: "center" });
  doc.text("creators13.lovable.app", W / 2, 276, { align: "center" });
  doc.setFillColor(...GOLD);
  doc.rect(0, 290, W, 7, "F");

  doc.save(`Creators13-receipt-${item.receipt_number ?? item.id}.pdf`);
}
