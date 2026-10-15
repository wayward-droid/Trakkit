import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  HeadingLevel,
  Header,
  Footer,
  PageNumber,
  BorderStyle,
} from "docx";
import { columns, table, summary, scopeNote } from "./common.js";
const paragraph = (text, options = {}) =>
  new Paragraph({
    children: [new TextRun({ text, size: 20, ...options })],
    spacing: { after: 140 },
  });
export async function create(report) {
  const rows = [columns, ...table(report)],
    widths = [1350, 1000, 4200, 2500, 2100, 2300, 1948];
  const border = { style: BorderStyle.SINGLE, size: 4, color: "DCE6DC" };
  const doc = new Document({
    creator: "Trakkit",
    title: `${report.workspace} - ${report.title}`,
    styles: { default: { document: { run: { font: "Calibri", size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 16838, height: 11906 },
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        headers: {
          default: new Header({
            children: [
              paragraph("EXPENSE TRACKER", { bold: true, color: "1B4839" }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun("Page "),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
          paragraph(report.workspace, { bold: true, size: 28 }),
          paragraph(report.period),
          paragraph(scopeNote(report)),
          paragraph(report.rateNote),
          paragraph(
            `Generated ${report.generated.slice(0, 16).replace("T", " ")} UTC. Workspace time zone: ${report.timeZone}.`,
            { color: "66746C" },
          ),
          paragraph(summary(report), { bold: true, color: "1B4839" }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: widths,
            borders: {
              top: border,
              bottom: border,
              left: border,
              right: border,
              insideHorizontal: border,
              insideVertical: border,
            },
            rows: rows.map(
              (row, i) =>
                new TableRow({
                  tableHeader: i === 0,
                  cantSplit: true,
                  children: row.map(
                    (text, j) =>
                      new TableCell({
                        width: { size: widths[j], type: WidthType.DXA },
                        margins: { top: 90, bottom: 90, left: 100, right: 100 },
                        shading: {
                          fill:
                            i === 0 ? "1B4839" : i % 2 ? "F3F7F4" : "FFFFFF",
                        },
                        children: String(text)
                          .split("\n")
                          .map(
                            (line) =>
                              new Paragraph({
                                spacing: { after: 40 },
                                children: [
                                  new TextRun({
                                    text: line,
                                    size: 17,
                                    bold: i === 0,
                                    color: i === 0 ? "FFFFFF" : "20382C",
                                  }),
                                ],
                              }),
                          ),
                      }),
                  ),
                }),
            ),
          }),
          ...(!report.rows.length
            ? [paragraph("No transactions match the selected filters.")]
            : []),
        ],
      },
    ],
  });
  return Packer.toBlob(doc);
}
