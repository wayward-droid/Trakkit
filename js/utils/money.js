export const CURRENCIES = [
  ["NGN", "Nigerian naira", 2],
  ["USD", "US dollar", 2],
  ["EUR", "Euro", 2],
  ["GBP", "Pound sterling", 2],
  ["GHS", "Ghanaian cedi", 2],
  ["KES", "Kenyan shilling", 2],
  ["ZAR", "South African rand", 2],
  ["CAD", "Canadian dollar", 2],
  ["AED", "UAE dirham", 2],
  ["INR", "Indian rupee", 2],
  ["CNY", "Chinese yuan", 2],
  ["JPY", "Japanese yen", 0],
].map(([code, name, decimals]) => ({ code, name, decimals }));
export const precision = (code) =>
  CURRENCIES.find((c) => c.code === code)?.decimals ?? 2;
/** Format a decimal string without converting money to floating point. */
export function formatMoney(
  value,
  currencyCode,
  decimals = precision(currencyCode),
  locale = "en-NG",
) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!match || !Number.isInteger(decimals) || decimals < 0 || decimals > 4)
    throw new Error("Invalid money");
  const fraction = (match[3] || "").padEnd(decimals, "0");
  if (fraction.slice(decimals).replace(/0/g, ""))
    throw new Error("Amount is not rounded");
  const whole = BigInt(match[2]);
  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const parts = fmt
    .formatToParts(whole)
    .map((p) => (p.type === "fraction" ? fraction.slice(0, decimals) : p.value))
    .join("");
  return (
    (match[1] && (whole !== 0n || /[1-9]/.test(fraction)) ? "-" : "") + parts
  );
}
/** Exact decimal arithmetic for currency conversion and saved-rate previews. */
export function scaled(value, decimals = 2) {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!m || (m[3] || "").slice(decimals).replace(/0/g, ""))
    throw new Error("Invalid currency precision");
  return (
    (m[1] ? -1n : 1n) *
    (BigInt(m[2]) * 10n ** BigInt(decimals) +
      BigInt((m[3] || "").padEnd(decimals, "0").slice(0, decimals) || "0"))
  );
}
export function decimal(value, decimals = 2) {
  const sign = value < 0n ? "-" : "";
  const v = (value < 0n ? -value : value)
    .toString()
    .padStart(decimals + 1, "0");
  return (
    sign + (decimals ? v.slice(0, -decimals) + "." + v.slice(-decimals) : v)
  );
}
export function convert(amount, rate, sourceDecimals, targetDecimals) {
  const numerator =
    scaled(amount, sourceDecimals) *
    scaled(rate, 8) *
    10n ** BigInt(targetDecimals);
  const divisor = 10n ** BigInt(sourceDecimals + 8);
  const sign = numerator < 0n ? -1n : 1n;
  return decimal(
    sign * ((numerator * sign + divisor / 2n) / divisor),
    targetDecimals,
  );
}
