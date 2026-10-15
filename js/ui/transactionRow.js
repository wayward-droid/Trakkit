import { el, emptyState } from "./dom.js";
import { formatMoney } from "../utils/money.js";
import { dateLabel } from "../utils/format.js";
import { canEdit } from "../utils/permissions.js";
const symbols = {
  Food: "◒",
  Transport: "↗",
  Rent: "⌂",
  Utilities: "ϟ",
  Health: "+",
  Shopping: "◇",
  Entertainment: "♪",
  Salary: "↙",
  "Other income": "↙",
};
export function renderTransactions(
  container,
  rows,
  { workspace, userId, onEdit, onDelete, onResubmit, recent = false },
) {
  if (!rows.length) {
    container.replaceChildren(
      emptyState(
        "A fresh page.",
        "No transactions match this view. Add an entry or adjust your filters.",
      ),
    );
    return;
  }
  const table = el("table", { class: "tx-table" }),
    head = el("tr");
  for (const h of [
    "Transaction",
    "Category",
    "Date",
    "Status",
    "Amount",
    ...(recent ? [] : ["Actions"]),
  ])
    head.append(el("th", { scope: "col" }, h));
  table.append(el("thead", {}, head));
  const body = el("tbody");
  for (const t of rows) {
    const desc = el(
      "div",
      { class: "row-title" },
      el(
        "span",
        { class: "category-icon", "aria-hidden": "true" },
        symbols[t.category_name] || "◇",
      ),
      el(
        "div",
        {},
        el("strong", {}, t.note || t.category_name),
        el("small", {}, t.account_name + " · " + t.creator_name),
      ),
    );
    const amount = el(
      "td",
      { class: "amount-cell" + (t.type === "income" ? " positive" : "") },
      (t.type === "income" ? "+" : "−") +
        formatMoney(t.amount, t.currency_code),
    );
    if (t.currency_code !== workspace.base_currency)
      amount.append(
        el(
          "small",
          {},
          formatMoney(t.amount_base, workspace.base_currency) +
            " · " +
            (t.rate_source === "manual" ? "manual rate" : t.rate_date),
        ),
      );
    if (t.status === "rejected" && t.reject_reason)
      desc
        .querySelector("div")
        .append(
          el("small", { class: "text-danger" }, "Reason: " + t.reject_reason),
        );
    const row = el(
      "tr",
      {},
      el("td", {}, desc),
      el("td", {}, t.category_name),
      el(
        "td",
        {},
        dateLabel(t.transaction_date, { day: "numeric", month: "short" }),
      ),
      el("td", {}, el("span", { class: "badge " + t.status }, t.status)),
      amount,
    );
    if (!recent) {
      const actions = el("div", { class: "row-actions" });
      if (canEdit(workspace, t, userId)) {
        actions.append(
          el(
            "button",
            {
              type: "button",
              "aria-label": "Edit " + (t.note || t.category_name),
              onclick: () => onEdit?.(t),
            },
            "Edit",
          ),
          el(
            "button",
            {
              type: "button",
              class: "delete-action",
              "aria-label": "Delete " + (t.note || t.category_name),
              onclick: () => onDelete?.(t),
            },
            "Delete",
          ),
        );
        if (t.status === "rejected" && onResubmit)
          actions.append(
            el(
              "button",
              { type: "button", onclick: () => onResubmit(t) },
              "Resubmit",
            ),
          );
      } else actions.append(el("span", { class: "subtle" }, "View only"));
      row.append(el("td", {}, actions));
    }
    body.append(row);
  }
  table.append(body);
  container.replaceChildren(
    el(
      "div",
      {
        class: "table-scroll",
        tabindex: "0",
        "aria-label": "Transactions table",
      },
      table,
    ),
  );
}
