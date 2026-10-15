export const columns = [
  "Date",
  "Type",
  "Category / note",
  "Account",
  "Original amount",
  "Report amount",
  "Status",
];
export const table = (report) =>
  report.rows.map((r) => [
    r.transaction_date,
    r.type,
    [r.category_name, r.note].filter(Boolean).join("\n"),
    r.account_name || "",
    `${r.currency_code} ${r.amount}`,
    `${report.currency} ${r.report_amount}`,
    r.status,
  ]);
export const summary = (r) =>
  `Income: ${r.currency} ${r.totals.income}    Expenses: ${r.currency} ${r.totals.expense}    Net: ${r.currency} ${r.totals.net}`;
export const scopeNote = (r) =>
  `${r.scope}. Totals include approved entries only. ${r.rows.length} matching transactions, including other statuses when selected.`;
