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
    rate = el("input", {
      name: "report_rate",
      inputmode: "decimal",
      placeholder: "Cached rate, or enter your own",
    }),
    rateLabel = el("label", {}, "Exchange rate", rate),
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
    rateLabel,
    apply,
    status,
    error,
  );
  container.replaceChildren(form);
  function showRate() {
    rateLabel.hidden = select.value === workspace?.base_currency;
    rateLabel.firstChild.textContent = `1 ${workspace?.base_currency || "base currency"} equals`;
    rate.setAttribute(
      "aria-label",
      `Units of ${select.value} per 1 ${workspace?.base_currency}`,
    );
  }
  select.onchange = () => {
    version++;
    rate.value = "";
    message(form, "");
    showRate();
  };
  rate.oninput = () => {
    version++;
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
        if (rate.value.trim()) {
          if (
            !/^\d+(\.\d{1,8})?$/.test(rate.value.trim()) ||
            scaled(rate.value.trim(), 8) <= 0n ||
            scaled(rate.value.trim(), 8) >= 100000000000000000000n
          )
            throw new Error(
              "Enter a positive exchange rate below 1 trillion, with up to 8 decimal places.",
            );
          result = {
            rate: rate.value.trim(),
            source: "manual",
            date: null,
            stale: false,
          };
        } else result = await reportExchangeRate(ws.id, currency);
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
        : `Showing ${current.currency}: 1 ${current.base} = ${current.rate} ${current.currency} · ${current.source === "manual" ? "manual rate" : "cached " + current.date}${current.stale ? " · rate is over 3 days old" : ""}. Converted reports use this single rate; account balances keep their original currency.`;
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
      rate.value = "";
      message(form, "");
      showRate();
      describe();
      if (select.value !== current.currency)
        status.textContent +=
          " Apply your preferred currency using a cached or manual rate.";
    },
    quote: () => ({ ...current }),
  };
}
