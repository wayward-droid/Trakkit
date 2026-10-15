import { el, fillSelect, busy, message } from "./dom.js";
import {
  CURRENCIES,
  scaled,
  convert,
  precision,
  decimal,
} from "../utils/money.js";
import { reportExchangeRate } from "../services/reports.js";

export function convertSummary(summary, quote) {
  if (summary.currency === quote.currency) return summary;
  const change = (value) =>
    convert(
      value,
      quote.rate,
      precision(summary.currency),
      precision(quote.currency),
    );
  const income = change(summary.income),
    expense = change(summary.expense);
  return {
    ...summary,
    currency: quote.currency,
    income,
    expense,
    net_change: decimal(
      scaled(income, precision(quote.currency)) -
        scaled(expense, precision(quote.currency)),
      precision(quote.currency),
    ),
    categories: summary.categories?.map((g) => ({
      ...g,
      amount: change(g.amount),
    })),
  };
}

/** Conversion changes the view and exports, never stored account balances. */
export function reportCurrency(container, onChange) {
  let workspace,
    current,
    version = 0;
  const form = el("form", { class: "report-controls" }),
    select = el("select", { name: "report_currency" }),
    apply = el(
      "button",
      { type: "submit", class: "button secondary" },
      "Apply currency",
    ),
    status = el("p", {
      class: "field-help report-rate-note",
      "aria-live": "polite",
    }),
    error = el("p", { class: "form-error", role: "alert", hidden: true });
  fillSelect(
    select,
    CURRENCIES.map((c) => ({ value: c.code, label: c.code + " · " + c.name })),
  );
  form.append(
    el("label", {}, "Report currency", select),
    apply,
    status,
    error,
  );
  container.replaceChildren(form);
  function showRate() {
    // Currency selection only changes the target; the rate is fetched on Apply.
  }
  select.onchange = () => {
    version++;
    message(form, "");
    showRate();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const ticket = ++version,
      ws = workspace,
      currency = select.value;
    message(form, "");
    busy(apply, true, "Applying…");
    try {
      let result = { rate: "1", source: "base", date: null, stale: false };
      if (currency !== ws.base_currency) {
        result = await reportExchangeRate(ws.id, currency);
      }
      if (ticket !== version || workspace.id !== ws.id) return;
      current = { ...result, currency, base: ws.base_currency };
      describe();
      onChange?.(current);
    } catch (e) {
      if (ticket === version) message(form, e.message);
    } finally {
      busy(apply, false);
    }
  };
  function describe() {
    status.textContent =
      current.currency === current.base
        ? `Showing ${current.base}, the workspace currency.`
        : `Showing ${current.currency}: 1 ${current.base} = ${current.rate} ${current.currency} · ${current.source === "manual" ? "saved manual rate" : "online rate · " + current.date}${current.stale ? " · rate is over 3 days old" : ""}. Converted reports use this single rate; account balances keep their original currency.`;
  }
  return {
    setWorkspace(ws, preferred) {
      if (
        workspace?.id === ws.id &&
        workspace.base_currency === ws.base_currency
      )
        return;
      version++;
      workspace = { ...ws };
      current = {
        currency: ws.base_currency,
        base: ws.base_currency,
        rate: "1",
        source: "base",
      };
      select.value = preferred || ws.base_currency;
      message(form, "");
      showRate();
      describe();
      if (select.value !== current.currency)
        status.textContent +=
          " Choose a report currency and apply it to fetch the latest available online rate.";
    },
    quote: () => ({ ...current }),
  };
}
