import { scaled, precision } from "./money.js";
export function validAmount(amount, currency, allowZero = false) {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(String(amount)))
    throw new Error("Enter an amount using digits and a decimal point.");
  const n = scaled(amount, precision(currency));
  if (
    n < 0n ||
    (!allowZero && n === 0n) ||
    n >= 1000000000000n * 10n ** BigInt(precision(currency))
  )
    throw new Error("Enter an amount greater than zero and below 1 trillion.");
  return String(amount);
}
export function validDate(date, max) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date ||
    date > max
  )
    throw new Error(
      "Choose a valid date no later than today in this workspace.",
    );
  return date;
}
export function requiredText(text, max, label) {
  const s = text.trim();
  if (!s || s.length > max)
    throw new Error(`${label} must be 1–${max} characters.`);
  return s;
}

/** New entries are today-only; old entries allow notes/review, not financial rewrites. */
export function validTransactionDate(input, currentDate, existing) {
  validDate(input.transaction_date, currentDate);
  if (!existing && input.transaction_date !== currentDate)
    throw new Error(
      "Income and expenses must be dated today. Backdating is not allowed.",
    );
  if (existing && existing.transaction_date < currentDate) {
    const financial = [
      "amount",
      "account_id",
      "category_id",
      "type",
      "transaction_date",
      "rate_source",
      "exchange_rate",
      "payment_method",
    ];
    const changed = financial.some((k) => {
      if (!(k in input)) return false;
      if (k === "amount" || k === "exchange_rate")
        return (
          scaled(
            input[k],
            k === "amount" ? precision(existing.currency_code) : 8,
          ) !==
          scaled(
            existing[k],
            k === "amount" ? precision(existing.currency_code) : 8,
          )
        );
      return (input[k] ?? "") !== (existing[k] ?? "");
    });
    if (changed)
      throw new Error(
        "Past financial entries are locked. You can update the note or review the entry.",
      );
  } else if (existing && input.transaction_date !== currentDate)
    throw new Error("Income and expenses must be dated today.");
  return input.transaction_date;
}
