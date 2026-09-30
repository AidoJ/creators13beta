import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export async function downloadProspectusPdf() {
  const pages = Array.from(document.querySelectorAll<HTMLElement>("[data-prospectus-page]"));
  if (!pages.length) throw new Error("The prospectus pages are not ready yet.");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  for (let index = 0; index < pages.length; index += 1) {
    if (index > 0) pdf.addPage("a4", "landscape");
    const canvas = await html2canvas(pages[index], {
      scale: 2,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 297, 210, undefined, "FAST");
  }
  pdf.save("13CREATORS-Practitioner-Prospectus.pdf");
}