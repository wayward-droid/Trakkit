/** Calendar date in the workspace's time zone. */
export function today(zone = "Africa/Lagos", date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}
export const monthStart = (date) => date.slice(0, 7) + "-01";
export function shiftMonth(month, by) {
  const d = new Date(month + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 10);
}
export function dateLabel(
  date,
  options = { day: "numeric", month: "short", year: "numeric" },
) {
  return new Intl.DateTimeFormat("en-NG", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
export const titleCase = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
export const initials = (s) =>
  s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
