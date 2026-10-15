import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const app = existsSync(new URL("../dist/js/", import.meta.url))
  ? "../dist/js/"
  : "../js/";
const { formatMoney, scaled, decimal, convert } = await import(
  app + "utils/money.js"
);
const { validAmount, validDate } = await import(app + "utils/validate.js");
const { csvCell, transactionCsv } = await import(app + "utils/csv.js");
const { today } = await import(app + "utils/format.js");
test("Large monetary values keep every minor unit", () => {
  assert.equal(scaled("999999999999.99"), 99999999999999n);
  assert.equal(decimal(99999999999999n), "999999999999.99");
  assert.match(formatMoney("999999999999.99", "NGN"), /999,999,999,999\.99/);
});
test("Twenty hand-calculated conversions and minor-unit rounding", () => {
  const cases = [
    ["10", "1500", 2, 2, "15000.00"],
    ["1", "150.4", 2, 0, "150"],
    ["1", "150.5", 2, 0, "151"],
    ["0.01", "0.5", 2, 2, "0.01"],
    ["1000", "1", 2, 2, "1000.00"],
    ["250", "1", 2, 2, "250.00"],
    ["12.34", "2", 2, 2, "24.68"],
    ["1", "0.25", 2, 2, "0.25"],
    ["100", "0.0125", 0, 2, "1.25"],
    ["3", "0.33333333", 2, 2, "1.00"],
    ["5", "0.1", 2, 0, "1"],
    ["8", "0.125", 2, 2, "1.00"],
    ["99.99", "1.5", 2, 2, "149.99"],
    ["2.01", "0.5", 2, 2, "1.01"],
    ["2", "0.004", 2, 2, "0.01"],
    ["12", "0.0001", 2, 2, "0.00"],
    ["10", "3.25", 0, 2, "32.50"],
    ["10000", "0.01", 0, 0, "100"],
    ["100.25", "4", 2, 2, "401.00"],
    ["0.01", "1000000", 2, 2, "10000.00"],
  ];
  for (const [a, r, s, t, expected] of cases)
    assert.equal(convert(a, r, s, t), expected, `${a} x ${r}`);
});
test("Validation rejects invalid values and unsupported precision", () => {
  for (const value of [
    "0",
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    "1000000000000",
    "1,000",
    "1.001",
  ])
    assert.throws(() => validAmount(value, "NGN"));
  assert.throws(() => validAmount("10.5", "JPY"));
  assert.equal(validAmount("10", "JPY"), "10");
  assert.equal(validAmount("100.00", "USD"), "100.00");
});
test("Dates are validated in the workspace timezone", () => {
  assert.equal(
    today("Africa/Lagos", new Date("2026-10-08T23:30:00Z")),
    "2026-10-09",
  );
  assert.throws(() => validDate("2026-02-30", "2026-10-09"));
  assert.throws(() => validDate("2026-10-10", "2026-10-09"));
  assert.equal(validDate("2026-10-09", "2026-10-09"), "2026-10-09");
});
test("CSV quotes multiline content and neutralizes spreadsheet formulas", () => {
  for (const value of [
    "=1+1",
    "+SUM(A1)",
    "-1+1",
    "@SUM(A1)",
    "\tformula",
    "\rformula",
    "  =cmd",
  ])
    assert.ok(csvCell(value).startsWith("\"'"));
  assert.equal(
    csvCell('Lunch, "friends"\nDinner'),
    '"Lunch, ""friends""\nDinner"',
  );
  assert.ok(transactionCsv([]).includes("base_currency"));
});
