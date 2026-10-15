import { scaled, decimal, precision, convert } from "./money.js";
import { ownOnly } from "./permissions.js";

export function buildReport(workspace, rows, filters = {}, quote) {
  const fx = quote || {
    currency: workspace.base_currency,
    base: workspace.base_currency,
    rate: "1",
    source: "base",
  };
  const scale = precision(fx.currency);
  let income = 0n,
    expense = 0n;
  const groups = new Map();
  const records = rows.map((row) => {
    const value = convert(
      row.amount_base,
      fx.rate,
      precision(workspace.base_currency),
      scale,
    );
    if (row.status === "approved") {
      const n = scaled(value, scale);
      if (row.type === "income") income += n;
      else {
        expense += n;
        groups.set(
          row.category_name || "Other",
          (groups.get(row.category_name || "Other") || 0n) + n,
        );
      }
    }
    return { ...row, report_amount: value };
  });
  const selected = Object.entries(filters).filter(
    ([key, value]) => value && !["page", "pageSize"].includes(key),
  );
  const labels = {
    from: "From",
    to: "To",
    type: "Type",
    status: "Status",
    search: "Note contains",
    accountId: "Account",
    categoryId: "Category",
  };
  const description =
    selected
      .map(([key, value]) => {
        if (key === "accountId")
          value =
            rows.find((r) => r.account_id === value)?.account_name ||
            "Selected account";
        if (key === "categoryId")
          value =
            rows.find((r) => r.category_id === value)?.category_name ||
            "Selected category";
        return `${labels[key] || key}: ${value}`;
      })
      .join("; ") || "All dates and statuses";
  return {
    title: "Income & expense report",
    workspace: workspace.name,
    period: description,
    currency: fx.currency,
    baseCurrency: workspace.base_currency,
    generated: new Date().toISOString(),
    timeZone: workspace.time_zone,
    scope: ownOnly(workspace)
      ? "Your visible transactions only"
      : "Workspace transactions",
    rateNote:
      fx.currency === workspace.base_currency
        ? `Amounts in ${fx.currency}.`
        : `Converted at 1 ${workspace.base_currency} = ${fx.rate} ${fx.currency} (${fx.source}${fx.date ? ", " + fx.date : ""}${fx.stale ? "; over 3 days old" : ""}). Single report rate; original amounts retained.`,
    totals: {
      income: decimal(income, scale),
      expense: decimal(expense, scale),
      net: decimal(income - expense, scale),
    },
    categories: [...groups]
      .map(([name, value]) => ({ name, amount: decimal(value, scale) }))
      .sort((a, b) =>
        scaled(a.amount, scale) > scaled(b.amount, scale) ? -1 : 1,
      ),
    rows: records,
  };
}

export const reportColumns = [
  "Date",
  "Type",
  "Category / note",
  "Account",
  "Original amount",
  "Report amount",
  "Status",
];
export function reportTable(report) {
  return report.rows.map((r) => [
    r.transaction_date,
    r.type,
    [r.category_name, r.note].filter(Boolean).join("\n"),
    r.account_name || "",
    `${r.currency_code} ${r.amount}`,
    `${report.currency} ${r.report_amount}`,
    r.status,
  ]);
}
