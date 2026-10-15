import { startPage } from "./app.js";
import { balances, addAccount } from "../services/accounts.js";
import { listCategories, saveCategory } from "../services/categories.js";
import { canManage } from "../utils/permissions.js";
import { CURRENCIES, formatMoney, scaled, precision } from "../utils/money.js";
import { requiredText } from "../utils/validate.js";
import { titleCase } from "../utils/format.js";
import { el, fillSelect, message, busy, emptyState } from "../ui/dom.js";
import { openModal } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
let app;
function accountForm() {
  const w = { ...app.workspace },
    epoch = app.epoch,
    m = openModal(
      "A new account.",
      "Keep a separate balance in its original currency.",
    ),
    form = el("form", { class: "form-stack" }),
    name = el("input", {
      required: true,
      maxlength: "40",
      placeholder: "e.g. Everyday account",
    }),
    type = el("select"),
    currency = el("select"),
    opening = el("input", {
      type: "text",
      inputmode: "decimal",
      value: "0",
      required: true,
    });
  fillSelect(
    type,
    ["cash", "bank", "card", "wallet"].map((t) => ({
      value: t,
      label: titleCase(t),
    })),
  );
  fillSelect(
    currency,
    CURRENCIES.map((c) => ({ value: c.code, label: c.code + " · " + c.name })),
  );
  currency.value = w.base_currency;
  const save = el(
    "button",
    { type: "submit", class: "button" },
    "Create account",
  );
  form.append(
    el("label", {}, "Account name", name),
    el(
      "div",
      { class: "field-row" },
      el("label", {}, "Account type", type),
      el("label", {}, "Currency", currency),
    ),
    el("label", {}, "Opening balance", opening),
    el(
      "p",
      { class: "field-help" },
      "The account currency is fixed. Opening balances are separate from this month’s income.",
    ),
    el("p", { class: "form-error", role: "alert", hidden: true }),
    save,
  );
  m.content.append(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    message(form, "");
    try {
      const input = {
        name: requiredText(name.value, 40, "Account name"),
        type: type.value,
        currency_code: currency.value,
        opening_balance: opening.value,
      };
      const n = scaled(input.opening_balance, precision(currency.value));
      if (
        n <= -1000000000000n * 10n ** BigInt(precision(currency.value)) ||
        n >= 1000000000000n * 10n ** BigInt(precision(currency.value))
      )
        throw new Error(
          "Opening balance must be less than 1 trillion in magnitude.",
        );
      if (epoch !== app.epoch)
        throw new Error("Workspace changed. Reopen the form.");
      busy(save, true);
      await addAccount(w.id, input);
      m.close();
      if (epoch === app.epoch) {
        toast("Account created.");
        await app.refresh();
      }
    } catch (e) {
      message(form, e.message);
    } finally {
      busy(save, false);
    }
  };
  name.focus();
}
function categoryForm(existing) {
  const w = { ...app.workspace },
    epoch = app.epoch,
    m = openModal(existing ? "Edit category" : "A new category.", w.name),
    form = el("form", { class: "form-stack" }),
    name = el("input", {
      required: true,
      maxlength: "40",
      value: existing?.name || "",
    }),
    type = el("select", { disabled: Boolean(existing) }),
    color = el("input", { type: "color", value: existing?.color || "#34856c" }),
    save = el("button", { type: "submit", class: "button" }, "Save category");
  fillSelect(type, [
    { value: "expense", label: "Expense" },
    { value: "income", label: "Income" },
  ]);
  type.value = existing?.type || "expense";
  form.append(
    el("label", {}, "Category name", name),
    el(
      "div",
      { class: "field-row" },
      el("label", {}, "Transaction type", type),
      el("label", {}, "Category colour", color),
    ),
    el("p", { class: "form-error", role: "alert", hidden: true }),
    save,
  );
  m.content.append(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    message(form, "");
    try {
      const input = {
        name: requiredText(name.value, 40, "Category name"),
        type: type.value,
        color: color.value,
      };
      if (epoch !== app.epoch)
        throw new Error("Workspace changed. Reopen the form.");
      busy(save, true);
      await saveCategory(w.id, input, existing?.id);
      m.close();
      if (epoch === app.epoch) {
        toast("Category saved.");
        await app.refresh();
      }
    } catch (e) {
      message(form, e.message);
    } finally {
      busy(save, false);
    }
  };
  name.focus();
}
await startPage({
  init: (ctx) => {
    app = ctx;
    document.querySelector("#add-account").onclick = accountForm;
    document.querySelector("#add-category").onclick = () => categoryForm();
  },
  load: async (ctx) => {
    const [data, categories] = await Promise.all([
      balances(ctx.workspace.id),
      listCategories(ctx.workspace.id),
    ]);
    if (!ctx.current()) return;
    document.querySelector("#add-account").hidden = !canManage(ctx.workspace);
    document.querySelector("#add-category").hidden = !canManage(ctx.workspace);
    const grid = document.querySelector("#accounts-grid");
    grid.replaceChildren(
      ...data.accounts.map((a) =>
        el(
          "article",
          { class: "account-card" },
          el("span", { class: "account-type" }, titleCase(a.type) + " account"),
          el("span", { class: "account-currency" }, a.currency_code),
          el("h2", {}, a.name),
          el(
            "p",
            { class: "balance" },
            a.balance === null
              ? "Private balance"
              : formatMoney(a.balance, a.currency_code),
          ),
          el(
            "p",
            { class: "field-help" },
            a.balance === null
              ? "Full balances are hidden for your role."
              : "Opening balance " +
                  formatMoney(a.opening_balance, a.currency_code),
          ),
        ),
      ),
    );
    if (!data.accounts.length)
      grid.append(
        emptyState(
          "Your accounts go here.",
          "Add cash, a bank account, a card or a wallet.",
        ),
      );
    document.querySelector("#categories-grid").replaceChildren(
      ...categories.map((c) => {
        const swatch = el("span", { class: "swatch", "aria-hidden": "true" });
        swatch.style.backgroundColor = /^#[\da-f]{6}$/i.test(c.color)
          ? c.color
          : "#819f89";
        const n = el(
          "div",
          { class: "category-item" },
          swatch,
          el(
            "div",
            {},
            el("strong", {}, c.name),
            el("small", {}, titleCase(c.type)),
          ),
        );
        if (canManage(ctx.workspace))
          n.append(
            el(
              "button",
              {
                type: "button",
                class: "text-button",
                onclick: () => categoryForm(c),
                "aria-label": "Edit " + c.name,
              },
              "Edit",
            ),
          );
        return n;
      }),
    );
  },
});
