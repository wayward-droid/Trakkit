import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { columns, table, summary, scopeNote } from "./common.js";
async function font(name) {
  const response = await fetch(
    new URL(`../fonts/${name}.ttf`, import.meta.url),
  );
  if (!response.ok)
    throw new Error(
      "Could not load the report font. Check your connection and retry.",
    );
  const bytes = new Uint8Array(await response.arrayBuffer());
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
export async function create(report, fonts) {
  const [regular, bold] =
    fonts || (await Promise.all([font("DejaVuSans"), font("DejaVuSans-Bold")]));
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  doc.addFileToVFS("DejaVuSans.ttf", regular);
  doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", bold);
  doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");
  doc.setFont("DejaVu", "normal");
  doc.setProperties({
    title: `${report.workspace} - ${report.title}`,
    subject: report.period,
    creator: "Trakkit",
  });
  doc.setFillColor(27, 72, 57);
  doc.rect(0, 0, 297, 30, "F");
  doc.setTextColor(255);
  doc.setFontSize(18);
  doc.text(report.title, 14, 14);
  doc.setFontSize(10);
  doc.text(report.workspace, 14, 24, { maxWidth: 269 });
  doc.setTextColor(30, 45, 40);
  doc.setFontSize(9);
  let y = 38;
  for (const line of [
    report.period,
    scopeNote(report),
    report.rateNote,
    `Generated ${report.generated.slice(0, 16).replace("T", " ")} UTC · Workspace time zone: ${report.timeZone}`,
  ]) {
    const parts = doc.splitTextToSize(line, 269);
    doc.text(parts, 14, y);
    y += parts.length * 4.5 + 2;
  }
  doc.setFont("DejaVu", "bold");
  doc.text(summary(report), 14, y + 2);
  y += 10;
  autoTable(doc, {
    head: [columns],
    body: table(report),
    startY: y,
    margin: { top: 15, bottom: 16, left: 14, right: 14 },
    styles: {
      font: "DejaVu",
      fontSize: 8,
      cellPadding: 3,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [27, 72, 57],
      textColor: [255, 255, 255],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [245, 248, 245] },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 18 },
      2: { cellWidth: 74 },
      3: { cellWidth: 39 },
      4: { cellWidth: 40 },
      5: { cellWidth: 45 },
      6: { cellWidth: 29 },
    },
    rowPageBreak: "avoid",
  });
  if (!report.rows.length) {
    doc.setFont("DejaVu", "normal");
    doc.text("No transactions match the selected filters.", 14, y + 20);
  }
  const count = doc.getNumberOfPages();
  for (let n = 1; n <= count; n++) {
    doc.setPage(n);
    doc.setFont("DejaVu", "normal");
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(`Trakkit · ${n} / ${count}`, 283, 202, { align: "right" });
  }
  return doc.output("blob");
}
