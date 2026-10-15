/** Quote all values and neutralize formula-leading text in spreadsheet software. */
export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function transactionCsv(rows) {
  const columns = [
    "transaction_date",
    "type",
    "note",
    "category_name",
    "account_name",
    "amount",
    "currency_code",
    "exchange_rate",
    "rate_date",
    "rate_source",
    "amount_base",
    "base_currency",
    "creator_name",
    "status",
  ];
  return (
    "\uFEFF" +
    [columns, ...rows.map((r) => columns.map((c) => r[c]))]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
