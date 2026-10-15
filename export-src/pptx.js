import pptxgen from "pptxgenjs";
import { columns, table, scopeNote } from "./common.js";
export async function create(report) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Trakkit";
  pptx.subject = report.period;
  pptx.title = `${report.workspace} - ${report.title}`;
  pptx.lang = "en-NG";
  pptx.theme = {
    headFontFace: "Aptos Display",
    bodyFontFace: "Aptos",
    lang: "en-NG",
  };
  function slide(title, subtitle = report.workspace) {
    const s = pptx.addSlide();
    s.background = { color: "F6F8F4" };
    s.addText("EXPENSE TRACKER", {
      x: 0.55,
      y: 0.22,
      w: 9,
      h: 0.3,
      fontSize: 10,
      bold: true,
      color: "42785D",
      margin: 0,
    });
    s.addText(title, {
      x: 0.55,
      y: 0.7,
      w: 12.2,
      h: 0.65,
      fontSize: 26,
      bold: true,
      color: "173D2D",
      margin: 0,
      breakLine: false,
    });
    s.addText(subtitle, {
      x: 0.55,
      y: 1.42,
      w: 12.2,
      h: 0.6,
      fontSize: 12,
      color: "5B6C60",
      margin: 0,
      valign: "top",
    });
    s.addText(`${report.generated.slice(0, 10)} · ${report.scope}`, {
      x: 0.55,
      y: 7.1,
      w: 11.5,
      h: 0.18,
      fontSize: 8,
      color: "5B6C60",
      margin: 0,
    });
    s.slideNumber = {
      x: 12,
      y: 7.06,
      w: 0.65,
      h: 0.24,
      color: "5B6C60",
      fontSize: 8,
      align: "right",
    };
    return s;
  }
  const first = slide(report.title, report.workspace + "\n" + report.period);
  [
    ["Approved income", report.totals.income],
    ["Approved expenses", report.totals.expense],
    ["Net change", report.totals.net],
  ].forEach(([label, value], i) => {
    const x = 0.55 + i * 4.17;
    first.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 2.4,
      w: 3.95,
      h: 1.6,
      rectRadius: 0.1,
      fill: { color: i === 0 ? "1B4839" : "FFFFFF" },
      line: { color: "DCE6DC" },
    });
    first.addText(label, {
      x: x + 0.2,
      y: 2.62,
      w: 3.55,
      h: 0.3,
      fontSize: 13,
      color: i === 0 ? "DDEFE2" : "56685A",
      margin: 0,
    });
    first.addText(`${report.currency} ${value}`, {
      x: x + 0.2,
      y: 3.1,
      w: 3.55,
      h: 0.55,
      fontSize: 21,
      color: i === 0 ? "FFFFFF" : "173D2D",
      margin: 0,
      fit: "shrink",
    });
  });
  first.addText(
    scopeNote(report) +
      "\n\n" +
      report.rateNote +
      "\n\nWorkspace time zone: " +
      report.timeZone,
    {
      x: 0.65,
      y: 4.45,
      w: 11.9,
      h: 1.8,
      fontSize: 13,
      color: "3F5747",
      margin: 0,
      breakLine: false,
    },
  );
  const data = table(report);
  if (!data.length) {
    const s = slide("Transactions");
    s.addText("No transactions match the selected filters.", {
      x: 0.65,
      y: 3,
      w: 12,
      h: 1,
      fontSize: 22,
      color: "3F5747",
    });
  }
  for (let i = 0; i < data.length; i += 3) {
    const s = slide(
      `Transactions ${i + 1}–${Math.min(i + 3, data.length)} of ${data.length}`,
      `Report amounts in ${report.currency}. Original account amounts included. All selected statuses shown.`,
    );
    const header = columns.map((text) => ({
      text,
      options: { bold: true, color: "FFFFFF", fill: "1B4839" },
    }));
    s.addTable([header, ...data.slice(i, i + 3)], {
      x: 0.55,
      y: 2.1,
      w: 12.2,
      h: 4.6,
      colW: [1.05, 0.8, 3.3, 1.7, 1.9, 2.1, 1.35],
      fontFace: "Aptos",
      fontSize: 10,
      margin: 0.07,
      border: { type: "solid", color: "DCE6DC", pt: 0.4 },
      color: "20382C",
      fill: "FFFFFF",
      valign: "top",
      rowH: 0.9,
      autoPage: false,
    });
  }
  return pptx.write({ outputType: "blob", compression: true });
}
