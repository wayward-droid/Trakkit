import { el, fillSelect, busy } from "./dom.js";
import { toast } from "./toast.js";
import { buildReport } from "../utils/report.js";

export function reportDownload(container, getData, label = "Download report") {
  const format = el("select", { "aria-label": "Report download format" });
  fillSelect(format, [
    { value: "pdf", label: "PDF (.pdf)" },
    { value: "docx", label: "Word (.docx)" },
    { value: "pptx", label: "PowerPoint (.pptx)" },
  ]);
  const button = el(
    "button",
    { class: "button secondary", type: "button" },
    label === "Download report" ? "Download report" : label,
  );
  container.replaceChildren(
    el("div", { class: "report-download report-download-card", "aria-label": "Export your financial report" }, el("div", { class: "report-download-copy" }, el("span", { class: "report-download-eyebrow" }, "EXPORT REPORT"), el("strong", {}, "Take your finances with you"), el("small", {}, "Choose a format to download a clean, shareable report.")), el("div", { class: "report-download-controls" }, format, button)),
  );
  button.onclick = async () => {
    const selected = format.value;
    busy(button, true, "Preparing…");
    format.disabled = true;
    try {
      const data = await getData();
      const report = buildReport(
        data.workspace,
        data.rows,
        data.filters,
        data.quote,
      );
      let module;
      if (selected === "pdf")
        module = await import("../../assets/vendor/export-pdf.js");
      else if (selected === "docx")
        module = await import("../../assets/vendor/export-docx.js");
      else module = await import("../../assets/vendor/export-pptx.js");
      const blob = await module.create(report),
        url = URL.createObjectURL(blob);
      const name =
        data.workspace.name
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-|-$/g, "") || "workspace";
      const a = el("a", {
        href: url,
        download: `${name}-report-${report.generated.slice(0, 10)}.${selected}`,
      });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast(
        `Downloaded ${selected.toUpperCase()} report with ${report.rows.length} transactions.`,
      );
    } catch (e) {
      toast(
        e.message || "Could not create the report. Please try again.",
        true,
      );
    } finally {
      busy(button, false);
      format.disabled = false;
    }
  };
}
