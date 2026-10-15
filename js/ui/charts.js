import { el } from "./dom.js";
import { formatMoney } from "../utils/money.js";
import { dateLabel } from "../utils/format.js";
const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
let charts = [];
export function destroyCharts() {
  charts.forEach((chart) => chart.destroy());
  charts = [];
}
export function dashboardCharts(summary, months, categories) {
  destroyCharts();
  const currency = summary.currency;
  document
    .querySelector("#trend-data")
    .replaceChildren(
      ...months.map((month) =>
        el(
          "tr",
          {},
          el(
            "td",
            {},
            dateLabel(month.month, { month: "short", year: "numeric" }),
          ),
          el("td", {}, formatMoney(month.income, currency)),
          el("td", {}, formatMoney(month.expense, currency)),
        ),
      ),
    );
  const groups = [...summary.categories].sort(
    (a, b) => Number(b.amount) - Number(a.amount),
  );
  const colors = groups.map(
    (group) =>
      categories.find((category) => category.id === group.category_id)?.color ||
      "#819f89",
  );
  document.querySelector("#category-legend").replaceChildren(
    ...groups.map((group, index) => {
      const swatch = el("span", { class: "swatch", "aria-hidden": "true" });
      swatch.style.backgroundColor = /^#[\da-f]{6}$/i.test(colors[index])
        ? colors[index]
        : "#819f89";
      return el(
        "li",
        {},
        swatch,
        el("span", {}, group.name),
        el("strong", {}, formatMoney(group.amount, currency)),
      );
    }),
  );
  document.querySelector("#donut-total").textContent = formatMoney(
    summary.expense,
    currency,
  );
  document.querySelector("#category-empty").hidden = groups.length > 0;
  document.querySelector(".donut-center").hidden = !groups.length;
  if (!globalThis.Chart) {
    document.querySelector(".chart-data").open = true;
    return;
  }
  Chart.defaults.color = css("--muted");
  Chart.defaults.font.family = css("--font-ui") || "system-ui, sans-serif";
  const animation = matchMedia("(prefers-reduced-motion: reduce)").matches
    ? false
    : { duration: 350 };
  charts.push(
    new Chart(document.querySelector("#trend-chart"), {
      type: "bar",
      data: {
        labels: months.map((month) =>
          dateLabel(month.month, { month: "short" }),
        ),
        datasets: [
          {
            label: "Income",
            data: months.map((month) => Number(month.income)),
            backgroundColor: css("--chart-income"),
            borderRadius: 4,
            maxBarThickness: 19,
          },
          {
            label: "Expenses",
            data: months.map((month) => Number(month.expense)),
            backgroundColor: css("--chart-expense"),
            borderRadius: 4,
            maxBarThickness: 19,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) =>
                `${context.dataset.label}: ${formatMoney(months[context.dataIndex][context.datasetIndex ? "expense" : "income"], currency)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 10 } },
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: css("--border") },
            ticks: {
              maxTicksLimit: 5,
              font: { size: 10 },
              callback: (value) =>
                new Intl.NumberFormat("en-NG", {
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(value),
            },
          },
        },
      },
    }),
  );
  if (groups.length)
    charts.push(
      new Chart(document.querySelector("#category-chart"), {
        type: "doughnut",
        data: {
          labels: groups.map((group) => group.name),
          datasets: [
            {
              data: groups.map((group) => Number(group.amount)),
              backgroundColor: colors,
              borderColor: css("--surface"),
              borderWidth: 4,
              hoverOffset: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "77%",
          animation,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context) =>
                  groups[context.dataIndex].name +
                  ": " +
                  formatMoney(groups[context.dataIndex].amount, currency),
              },
            },
          },
        },
      }),
    );
}
