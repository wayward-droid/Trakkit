import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
const root = existsSync(new URL("../dist/index.html", import.meta.url))
  ? new URL("../dist/", import.meta.url)
  : new URL("../", import.meta.url);
const { buildReport } = await import(new URL("js/utils/report.js", root));
const { validTransactionDate } = await import(
  new URL("js/utils/validate.js", root)
);
const modulePath = process.env.EXPENSE_QA_MODULES
  ? pathToFileURL(process.env.EXPENSE_QA_MODULES + "/jszip/lib/index.js").href
  : "jszip";
const { default: JSZip } = await import(modulePath);
const workspace = {
  id: "test",
  name: "Our household",
  base_currency: "NGN",
  time_zone: "Africa/Lagos",
  role: "owner",
  members_see_all: true,
};
const rows = Array.from({ length: 12 }, (_, i) => ({
  id: String(i),
  transaction_date: "2026-10-13",
  type: i === 0 ? "income" : "expense",
  status: i === 11 ? "submitted" : "approved",
  amount: "1000.25",
  amount_base: "1000.25",
  currency_code: "NGN",
  category_name: i === 0 ? "Salary" : "Food",
  account_name: "Everyday bank account",
  note:
    i === 2
      ? "José’s groceries & café <receipt> ₦100 – " +
        "Details of the purchase. ".repeat(6)
      : `Transaction ${i + 1}`,
}));
const report = buildReport(workspace, rows, {
  from: "2026-01-01",
  to: "2026-12-31",
});
test("Reports include every selected row, total only approved statuses and preserve exact conversion", () => {
  assert.equal(report.rows.length, 12);
  assert.equal(report.totals.income, "1000.25");
  assert.equal(report.totals.expense, "10002.50");
  const converted = buildReport(
    workspace,
    rows,
    {},
    { currency: "USD", rate: "0.001", source: "manual" },
  );
  assert.equal(converted.totals.income, "1.00");
  assert.equal(converted.totals.expense, "10.00");
  assert.equal(converted.rows[0].amount, "1000.25");
  assert.match(converted.rateNote, /manual/);
  const empty = buildReport(workspace, [], {});
  assert.equal(empty.totals.net, "0.00");
});
test("Date rules reject backdating, future dates and financial rewrites while allowing historical notes", () => {
  for (const type of ["income", "expense"]) {
    assert.throws(
      () =>
        validTransactionDate(
          { type, transaction_date: "2026-10-12" },
          "2026-10-13",
        ),
      /Backdating/,
    );
    assert.throws(
      () =>
        validTransactionDate(
          { type, transaction_date: "2026-10-14" },
          "2026-10-13",
        ),
      /no later than today/,
    );
    assert.equal(
      validTransactionDate(
        { type, transaction_date: "2026-10-13" },
        "2026-10-13",
      ),
      "2026-10-13",
    );
  }
  const old = {
    transaction_date: "2026-10-12",
    amount: "100",
    currency_code: "NGN",
  };
  assert.equal(
    validTransactionDate({ ...old, note: "New note" }, "2026-10-13", old),
    old.transaction_date,
  );
  assert.throws(
    () => validTransactionDate({ ...old, amount: "200" }, "2026-10-13", old),
    /locked/,
  );
});
test("Browser export bundles produce real PDF, Word and PowerPoint files with full records", async () => {
  for (const format of ["pdf", "docx", "pptx"]) {
    const { create } = await import(
      new URL(`assets/vendor/export-${format}.js`, root)
    );
    const fonts =
      format === "pdf"
        ? await Promise.all(
            ["DejaVuSans", "DejaVuSans-Bold"].map(async (n) =>
              (
                await fs.readFile(new URL(`assets/fonts/${n}.ttf`, root))
              ).toString("base64"),
            ),
          )
        : undefined;
    const blob = await create(report, fonts);
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (format === "pdf")
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    else {
      assert.equal(bytes.subarray(0, 2).toString(), "PK");
      const zip = await JSZip.loadAsync(bytes);
      const paths =
        format === "docx"
          ? ["word/document.xml"]
          : Object.keys(zip.files).filter((n) =>
              /^ppt\/slides\/slide\d+\.xml$/.test(n),
            );
      const xml = (
        await Promise.all(paths.map((n) => zip.file(n).async("string")))
      ).join("\n");
      const text = [
        ...xml.matchAll(/<(?:a|w):t(?: [^>]*)?>([^<]*)<\/(?:a|w):t>/g),
      ]
        .map((m) => m[1])
        .join(" ")
        .replace(/\s+/g, " ");
      assert.ok(
        text.includes("Transaction 12"),
        `${format} must include the last transaction`,
      );
      assert.ok(text.includes("José"), `${format} preserves Unicode text`);
      assert.ok(
        text.includes("10002.50"),
        `${format} includes the approved expense total`,
      );
      if (format === "pptx") assert.ok(paths.length >= 4);
    }
    if (process.env.EXPENSE_EXPORT_QA_DIR) {
      await fs.mkdir(process.env.EXPENSE_EXPORT_QA_DIR, { recursive: true });
      await fs.writeFile(
        `${process.env.EXPENSE_EXPORT_QA_DIR}/report.${format}`,
        bytes,
      );
    }
  }
});
