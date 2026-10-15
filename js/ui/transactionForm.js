import { el, fillSelect, message, busy } from "./dom.js";
import { openModal } from "./modal.js";
import { canIncome, canManage } from "../utils/permissions.js";
import {
  CURRENCIES,
  formatMoney,
  convert,
  precision,
  scaled,
} from "../utils/money.js";
import { today } from "../utils/format.js";
import { validAmount, validTransactionDate } from "../utils/validate.js";
/** UI only. The page supplies scoped quote/save callbacks. */
export function transactionForm({
  workspace,
  accounts,
  categories,
  existing,
  onQuote,
  onSave,
  onCreateAccount,
}) {
  const m = openModal(
      existing ? "Edit transaction" : "A new entry.",
      workspace.name + " · " + workspace.base_currency,
    ),
    form = el("form", { class: "form-stack" }),
    id = existing?.id || crypto.randomUUID();
  const historical = Boolean(
    existing && existing.transaction_date < today(workspace.time_zone),
  );
  let type = existing?.type || "expense",
    quoteVersion = 0,
    timer;
  const types = el("div", {
    class: "type-tabs",
    role: "group",
    "aria-label": "Transaction type",
  });
  for (const t of ["expense", "income"]) {
    if (t === "income" && !canIncome(workspace)) continue;
    types.append(
      el(
        "button",
        {
          type: "button",
          "aria-pressed": t === type,
          disabled: Boolean(existing),
          onclick: () => {
            type = t;
            updateType();
          },
        },
        t === "expense" ? "↗ Expense" : "↙ Income",
      ),
    );
  }
  const amount = el("input", {
      name: "amount",
      type: "text",
      inputmode: "decimal",
      required: true,
      placeholder: "0.00",
      value: existing?.amount || "",
      autocomplete: "off",
    }),
    account = el("select", { name: "account", required: true }),
    category = el("select", { name: "category", required: true }),
    date = el("input", {
      name: "date",
      type: "date",
      required: true,
      value: existing?.transaction_date || today(workspace.time_zone),
      min: historical ? existing.transaction_date : today(workspace.time_zone),
      max: historical ? existing.transaction_date : today(workspace.time_zone),
    }),
    note = el(
      "textarea",
      {
        name: "note",
        maxlength: "200",
        placeholder: "What was it for?",
        rows: "2",
      },
      existing?.note || "",
    ),
    method = el("select", { name: "payment_method" });
  fillSelect(
    account,
    accounts.map((a) => ({
      value: a.id,
      label: a.name + " · " + a.currency_code,
    })),
  );
  if (existing) account.value = existing.account_id;
  const currency = el("select", {
    name: "currency",
    "aria-label": "Transaction currency",
  });
  fillSelect(
    currency,
    CURRENCIES.map((c) => ({ value: c.code, label: c.code + " · " + c.name })),
  );
  currency.value =
    existing?.currency_code ||
    accounts[0]?.currency_code ||
    workspace.base_currency;
  const addCurrencyAccount = el(
    "button",
    { type: "button", class: "text-button" },
    "",
  );
  const accountHelp = el("p", { class: "field-help" });
  function updateAccountHelp(missing = !account.options.length) {
    const selected = accounts.find((a) => a.id === account.value);
    const balanceHint = selected?.balance == null
      ? "Balance visibility is restricted; the server checks funds before approval."
      : `Available balance: ${formatMoney(availableBalance(selected), selected.currency_code)}.`;
    accountHelp.textContent = missing
      ? `No ${currency.value} account yet. ${canManage(workspace) ? "Create one below to use this currency." : "Ask an owner or admin to add one."}`
      : `Amount is in ${currency.value}. Workspace totals use ${workspace.base_currency}. ${balanceHint}`;
  }
  function filterAccounts() {
    fillSelect(
      account,
      accounts
        .filter((a) => a.currency_code === currency.value)
        .map((a) => ({ value: a.id, label: a.name + " · " + a.currency_code })),
    );
    const missing = !account.options.length;
    addCurrencyAccount.hidden =
      !missing || !canManage(workspace) || !onCreateAccount;
    addCurrencyAccount.textContent = `Create a ${currency.value} cash account`;
    updateAccountHelp(missing);
    scheduleQuote();
  }
  currency.onchange = filterAccounts;
  account.onchange = () => {
    updateAccountHelp();
    scheduleQuote();
  };
  addCurrencyAccount.onclick = async () => {
    busy(addCurrencyAccount, true);
    try {
      const created = await onCreateAccount(currency.value);
      accounts.push(created);
      filterAccounts();
      account.value = created.id;
      message(form, "");
    } catch (e) {
      message(form, e.message);
    } finally {
      busy(addCurrencyAccount, false);
    }
  };
  fillSelect(
    method,
    [
      { value: "cash", label: "Cash" },
      { value: "bank", label: "Bank transfer" },
      { value: "card", label: "Card" },
      { value: "wallet", label: "Wallet" },
    ],
    "Not specified",
  );
  method.value = existing?.payment_method || "";
  const rateMode = el("select", { name: "rate_mode" }),
    rate = el("input", {
      name: "manual_rate",
      type: "text",
      inputmode: "decimal",
      placeholder: "Base currency per 1 account currency",
      value: existing?.rate_source === "manual" ? existing.exchange_rate : "",
    });
  fillSelect(rateMode, [
    ...(existing
      ? [{ value: "keep", label: "Keep the saved exchange rate" }]
      : []),
    { value: "auto", label: "Use a dated cached rate" },
    { value: "manual", label: "Enter a manual rate" },
  ]);
  rateMode.value = existing ? "keep" : "auto";
  const manualField = el("label", {}, "Manual exchange rate", rate),
    fx = el(
      "div",
      { class: "form-stack" },
      el("label", {}, "Exchange rate", rateMode),
      manualField,
    ),
    preview = el(
      "div",
      { class: "quote-preview", "aria-live": "polite" },
      "Enter an amount to see its workspace value.",
    ),
    attribution = el(
      "a",
      {
        class: "rate-attribution",
        href: "https://www.exchangerate-api.com",
        target: "_blank",
        rel: "noopener",
      },
      "Rates by ExchangeRate-API",
    );
  const error = el("p", { class: "form-error", role: "alert", hidden: true }),
    submit = el(
      "button",
      { type: "submit", class: "button" },
      existing ? "Save changes" : "Save transaction",
    );
  form.append(
    types,
    el("label", {}, "Currency", currency),
    accountHelp,
    addCurrencyAccount,
    el(
      "div",
      { class: "field-row" },
      el("label", {}, "Amount", amount),
      el("label", {}, "Account", account),
    ),
    el(
      "div",
      { class: "field-row" },
      el("label", {}, "Category", category),
      el("label", {}, "Date", date),
    ),
    el(
      "p",
      { class: "field-help" },
      historical
        ? "This date has passed. Financial details are locked; you can still update the note."
        : `Income and expenses can only be recorded today (${workspace.time_zone}).`,
    ),
    fx,
    preview,
    attribution,
    el("label", {}, "Note (optional)", note),
    el("label", {}, "Payment method (optional)", method),
    error,
    submit,
  );
  m.content.append(form);
  filterAccounts();
  if (existing) account.value = existing.account_id;
  if (historical)
    [currency, amount, account, category, date, method, rateMode, rate].forEach(
      (n) => (n.disabled = true),
    );
  function updateType() {
    for (const b of types.children)
      b.setAttribute(
        "aria-pressed",
        b.textContent.toLowerCase().includes(type),
      );
    fillSelect(
      category,
      categories.filter((c) => c.type === type),
    );
    scheduleQuote();
  }
  function selectedAccount() {
    return accounts.find((a) => a.id === account.value);
  }
  function availableBalance(a) {
    const scale = precision(a?.currency_code || workspace.base_currency);
    let minor = scaled(a?.balance ?? "0", scale);
    // The balance already includes an approved transaction being edited.
    // Add its old amount back when checking the replacement amount.
    if (existing && existing.status === "approved" && existing.type === "expense" && existing.account_id === a?.id) {
      minor += scaled(existing.amount, scale);
    }
    const negative = minor < 0n;
    const absolute = negative ? -minor : minor;
    const factor = 10n ** BigInt(scale);
    const whole = (absolute / factor).toString();
    const fraction = scale ? "." + (absolute % factor).toString().padStart(scale, "0") : "";
    return (negative ? "-" : "") + whole + fraction;
  }
  function keepRate() {
    return Boolean(
      existing &&
        rateMode.value === "keep" &&
        account.value === existing.account_id &&
        date.value === existing.transaction_date,
    );
  }
  function payload() {
    const a = selectedAccount();
    if (!a) throw new Error("Create an account before adding transactions.");
    validAmount(amount.value, a.currency_code);
    if (!category.value) throw new Error("Choose a category.");
    const row = {
      id,
      type,
      account_id: a.id,
      category_id: category.value,
      amount: amount.value,
      transaction_date: date.value,
      note: note.value.trim() || null,
      payment_method: method.value || null,
    };
    if (keepRate()) {
      row.rate_source = existing.rate_source;
      row.exchange_rate = existing.exchange_rate;
    } else if (
      rateMode.value === "manual" &&
      a.currency_code !== workspace.base_currency
    ) {
      if (!/^\d+(\.\d{1,8})?$/.test(rate.value) || scaled(rate.value, 8) <= 0n)
        throw new Error(
          "Enter a positive manual rate, with at most 8 decimal places.",
        );
      row.rate_source = "manual";
      row.exchange_rate = rate.value;
    } else {
      row.rate_source = "auto";
      if (existing) row.exchange_rate = null;
    }
    validTransactionDate(row, today(workspace.time_zone), existing);
    return row;
  }
  async function updateQuote(version) {
    if (!m.dialog.open) return;
    const a = selectedAccount(),
      foreign = a && a.currency_code !== workspace.base_currency;
    fx.hidden = !foreign;
    manualField.hidden = rateMode.value !== "manual";
    attribution.hidden = !foreign || rateMode.value === "manual";
    const keepOption = [...rateMode.options].find((o) => o.value === "keep");
    if (keepOption) {
      keepOption.disabled =
        account.value !== existing.account_id ||
        date.value !== existing.transaction_date;
      if (keepOption.disabled && rateMode.value === "keep")
        rateMode.value = "auto";
    }
    if (!amount.value) {
      preview.textContent = "Enter an amount to see its workspace value.";
      return;
    }
    try {
      const row = payload();
      let q;
      if (keepRate()) {
        q = {
          amount_base: convert(
            row.amount,
            existing.exchange_rate,
            precision(a.currency_code),
            precision(workspace.base_currency),
          ),
          exchange_rate: existing.exchange_rate,
          rate_date: existing.rate_date,
          rate_source: existing.rate_source,
        };
      } else
        q = await onQuote({
          workspaceId: workspace.id,
          accountId: a.id,
          amount: row.amount,
          date: row.transaction_date,
          manualRate: row.rate_source === "manual" ? row.exchange_rate : null,
        });
      if (version !== quoteVersion || !m.dialog.open) return;
      preview.classList.toggle("warning", Boolean(q.stale));
      preview.replaceChildren(
        el(
          "strong",
          {},
          formatMoney(q.amount_base, workspace.base_currency) +
            " in " +
            workspace.name,
        ),
        el(
          "small",
          {},
          foreign
            ? `1 ${a.currency_code} = ${q.exchange_rate} ${workspace.base_currency} · ${q.rate_source === "manual" ? "manual rate" : q.rate_date}${keepRate() ? " · saved rate preserved" : ""}${q.stale ? " · this rate is more than 3 days older than the transaction" : ""}`
            : "Same currency. No conversion needed.",
        ),
      );
    } catch (e) {
      if (version !== quoteVersion || !m.dialog.open) return;
      preview.classList.add("warning");
      preview.textContent = e.message;
    }
  }
  function scheduleQuote() {
    clearTimeout(timer);
    const version = ++quoteVersion;
    timer = setTimeout(() => updateQuote(version), 250);
  }
  form.addEventListener("input", scheduleQuote);
  form.addEventListener("change", scheduleQuote);
  m.dialog.addEventListener("close", () => {
    quoteVersion++;
    clearTimeout(timer);
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    message(form, "");
    try {
      const row = payload();
      const chosenAccount = selectedAccount();
      if (row.type === "expense" && chosenAccount?.balance != null) {
        const scale = precision(chosenAccount.currency_code);
        const availableMinor = scaled(chosenAccount.balance, scale) + (
          existing && existing.status === "approved" && existing.type === "expense" && existing.account_id === chosenAccount.id
            ? scaled(existing.amount, scale)
            : 0n
        );
        if (scaled(row.amount, scale) > availableMinor) {
          throw new Error(`Insufficient funds. Available balance: ${formatMoney((Number(availableMinor) / (10 ** scale)).toString(), chosenAccount.currency_code)}.`);
        }
      }
      busy(submit, true);
      await onSave(row, existing);
      if (m.dialog.open) m.close();
    } catch (error) {
      if (m.dialog.open)
        message(
          form,
          error.message ||
            "Unable to save. Check your connection and try again.",
        );
    } finally {
      if (m.dialog.open) busy(submit, false);
    }
  });
  updateType();
  if (existing) category.value = existing.category_id;
  amount.focus();
  return m;
}
