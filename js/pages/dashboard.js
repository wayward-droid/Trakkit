import { startPage } from "./app.js";
import { monthlySummary, yearlySummary } from "../services/reports.js";
import {
  listTransactions,
  exportTransactions,
} from "../services/transactions.js";
import { listCategories } from "../services/categories.js";
import { formatMoney } from "../utils/money.js";
import { today, monthStart, shiftMonth, dateLabel } from "../utils/format.js";
import { dashboardCharts, destroyCharts } from "../ui/charts.js";
import { renderTransactions } from "../ui/transactionRow.js";
import { reportCurrency, convertSummary } from "../ui/reportCurrency.js";
import { reportDownload } from "../ui/reportDownload.js";
let month, workspaceId, rendered, data, currencyControl;
function drawTotals() {
  if (!data) return;
  const quote = currencyControl.quote(),
    summary = convertSummary(data.summary, quote),
    annual = convertSummary(data.annual, quote),
    history = data.history.map((m) => convertSummary(m, quote));
  document.querySelector("#net-value").textContent = formatMoney(
    summary.net_change,
    summary.currency,
  );
  document.querySelector("#income-value").textContent = formatMoney(
    annual.income,
    annual.currency,
  );
  document.querySelector("#expense-value").textContent = formatMoney(
    summary.expense,
    summary.currency,
  );
  document.querySelector("#income-period").textContent =
    `1 Jan – 31 Dec ${data.year} · approved income`;
  rendered = [summary, history, data.categories];
  dashboardCharts(...rendered);
}
await startPage({
  init: (ctx) => {
    currencyControl = reportCurrency(
      document.querySelector("#report-currency"),
      drawTotals,
    );
    reportDownload(
      document.querySelector("#dashboard-download"),
      async () => {
        if (!ctx.workspace || !month)
          throw new Error("Wait for the workspace to load.");
        const workspace = { ...ctx.workspace },
          year = month.slice(0, 4),
          quote = currencyControl.quote();
        const filters = { from: `${year}-01-01`, to: `${year}-12-31` };
        return {
          workspace,
          quote,
          filters,
          rows: await exportTransactions(workspace.id, filters),
        };
      },
      "Download yearly report",
    );
    document.querySelector("[data-month-prev]").onclick = () => {
      month = shiftMonth(month, -1);
      ctx.refresh();
    };
    document.querySelector("[data-month-next]").onclick = () => {
      month = shiftMonth(month, 1);
      ctx.refresh();
    };
    document.addEventListener("themechange", () => {
      if (rendered && !document.querySelector("#page-content").hidden)
        dashboardCharts(...rendered);
    });
  },
  load: async (ctx) => {
    if (ctx.workspace.id !== workspaceId) {
      workspaceId = ctx.workspace.id;
      month = monthStart(today(ctx.workspace.time_zone));
    }
    destroyCharts();
    rendered = null;
    data = null;
    currencyControl.setWorkspace(ctx.workspace, ctx.profile.display_currency);
    const months = Array.from({ length: 6 }, (_, i) =>
      shiftMonth(month, i - 5),
    );
    const [summary, history, list, categories, annual] = await Promise.all([
      monthlySummary(ctx.workspace.id, month),
      Promise.all(
        months.map(async (m) => ({
          ...(await monthlySummary(ctx.workspace.id, m)),
          month: m,
        })),
      ),
      listTransactions(ctx.workspace.id, {
        from: month,
        to: new Date(Date.parse(shiftMonth(month, 1)) - 86400000)
          .toISOString()
          .slice(0, 10),
        pageSize: 5,
      }),
      listCategories(ctx.workspace.id),
      yearlySummary(ctx.workspace.id, Number(month.slice(0, 4))),
    ]);
    if (!ctx.current()) return;
    document.querySelector("[data-month-label]").textContent = dateLabel(
      month,
      { month: "long", year: "numeric" },
    );
    document.querySelector("[data-month-next]").disabled =
      month >= monthStart(today(ctx.workspace.time_zone));
    document.querySelector("#greeting").textContent =
      `Hello, ${ctx.profile.display_name.split(" ")[0]}. Here’s your month.`;
    renderTransactions(
      document.querySelector("#recent-transactions"),
      list.rows,
      { workspace: ctx.workspace, userId: ctx.user.id, recent: true },
    );
    document.querySelector("#page-content").hidden = false;
    data = { summary, history, categories, annual, year: month.slice(0, 4) };
    drawTotals();
  },
});
