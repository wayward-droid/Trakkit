import { startPage } from "./app.js";
import { monthlySummary, yearlySummary } from "../services/reports.js";
import { formatMoney } from "../utils/money.js";
import { today, monthStart } from "../utils/format.js";
let selectedMonth = "";
const $ = (s) => document.querySelector(s);
function monthBounds(month) { return month; }
await startPage({
  init: (ctx) => {
    const input = $("#report-month");
    input.addEventListener("change", () => { if (input.value) { selectedMonth = input.value + "-01"; ctx.refresh(); } });
  },
  load: async (ctx) => {
    if (!selectedMonth) selectedMonth = monthStart(today(ctx.workspace.time_zone));
    $("#report-month").value = selectedMonth.slice(0, 7);
    const year = Number(selectedMonth.slice(0, 4));
    const [monthly, annual] = await Promise.all([
      monthlySummary(ctx.workspace.id, selectedMonth),
      yearlySummary(ctx.workspace.id, year),
    ]);
    if (!ctx.current()) return;
    const currency = monthly.currency || ctx.workspace.base_currency;
    $("#report-income").textContent = formatMoney(monthly.income || 0, currency);
    $("#report-expenses").textContent = formatMoney(monthly.expense || 0, currency);
    $("#report-net").textContent = formatMoney(monthly.net_change || 0, currency);
    $("#report-year-income").textContent = formatMoney(annual.income || 0, annual.currency || currency);
    $("#report-year-expenses").textContent = formatMoney(annual.expense || 0, annual.currency || currency);
    $("#report-year-net").textContent = formatMoney(annual.net_change || 0, annual.currency || currency);
    $("#report-year-label").textContent = `Approved transactions · ${year}`;
  },
});
