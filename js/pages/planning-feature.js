import { startPage } from "./app.js";
import { getClient } from "../supabaseClient.js";
import { el, busy } from "../ui/dom.js";
import { toast } from "../ui/toast.js";

const $ = (s) => document.querySelector(s);
const money = (amount, currency) => new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "NGN", maximumFractionDigits: 2 }).format(Number(amount || 0));
const escapeText = (value) => String(value ?? "");

export function launchPlanningPage(config) {
  let app;
  const form = $("#planning-form");
  const list = $("#planning-list");
  const status = $("#planning-empty");
  const fields = config.fields;

  function buildField(field) {
    const input = el(field.type === "select" ? "select" : "input", {
      name: field.name,
      required: Boolean(field.required),
      type: field.type === "select" ? undefined : field.type,
      min: field.min,
      step: field.step,
      max: field.max,
      placeholder: field.placeholder,
    });
    if (field.type === "select") {
      for (const option of field.options) input.append(el("option", { value: option.value }, option.label));
    }
    if (field.defaultValue != null) input.value = field.defaultValue;
    return el("label", { class: "planning-field" }, el("span", {}, field.label), input);
  }

  form.replaceChildren(...fields.map(buildField), el("button", { class: "button", type: "submit" }, config.submitLabel || "Save"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(form).entries());
    const payload = { workspace_id: app.workspace.id };
    for (const field of fields) {
      let value = values[field.name];
      if (field.numeric) value = Number(value);
      payload[field.name] = value || (field.emptyAsNull ? null : value);
    }
    try {
      busy(submit, true, "Saving…");
      const db = await getClient();
      const { error } = await db.from(config.table).insert(payload);
      if (error) throw error;
      form.reset();
      for (const field of fields) if (field.defaultValue != null) form.elements[field.name].value = field.defaultValue;
      toast(config.savedMessage || "Saved successfully.");
      await app.refresh();
    } catch (error) {
      const missingPlanningTable = ["PGRST205", "42P01"].includes(error?.code) ||
        /could not find the table .*budgets|could not find the table .*savings_goals|could not find the table .*recurring_bills|relation .* does not exist/i.test(error?.message || "");
      toast(missingPlanningTable
        ? "Planning tables missing. Run supabase/migrations/005_planning_features.sql in Supabase SQL Editor, then reload."
        : error.message || "Could not save this item.", true);
    } finally {
      busy(submit, false);
    }
  });

  return startPage({
    init: (ctx) => { app = ctx; },
    load: async (ctx) => {
      const db = await getClient();
      const { data, error } = await db.from(config.table).select(config.columns).eq("workspace_id", ctx.workspace.id).order(config.orderBy || "created_at", { ascending: config.ascending ?? false });
      if (error) throw error;
      if (!ctx.current()) return;
      const total = data.reduce((sum, row) => sum + Number(row[config.totalField] || 0), 0);
      const totalLabel = $("#planning-total");
      if (totalLabel) totalLabel.textContent = money(total, ctx.workspace.base_currency);
      const count = $("#planning-count");
      if (count) count.textContent = `${data.length} ${data.length === 1 ? config.singular : config.plural}`;
      list.replaceChildren(...data.map((row) => {
        const title = el("strong", {}, escapeText(row[config.titleField]));
        const description = el("span", { class: "subtle" }, config.describe(row));
        const amount = el("strong", { class: "planning-amount" }, money(row[config.totalField], ctx.workspace.base_currency));
        const card = el("article", { class: "planning-item" }, el("div", { class: "planning-item-main" }, title, description), amount);
        if (config.progress) {
          const pct = Math.min(100, Math.max(0, Number(row.saved_amount) / Math.max(1, Number(row.target_amount)) * 100));
          card.append(el("div", { class: "planning-progress", role: "progressbar", "aria-label": `${row.name} progress`, "aria-valuenow": Math.round(pct), "aria-valuemin": 0, "aria-valuemax": 100 }, el("span", { style: `width:${pct}%` })));
          card.append(el("span", { class: "subtle planning-progress-label" }, `${money(row.saved_amount, ctx.workspace.base_currency)} saved · ${Math.round(pct)}%`));
        }
        const remove = el("button", { class: "text-button planning-delete", type: "button", "aria-label": `Delete ${row[config.titleField]}` }, "Delete");
        remove.addEventListener("click", async () => {
          if (!confirm(`Delete “${row[config.titleField]}”?`)) return;
          try {
            const { error: deleteError } = await db.from(config.table).delete().eq("workspace_id", ctx.workspace.id).eq("id", row.id);
            if (deleteError) throw deleteError;
            toast("Item deleted.");
            await app.refresh();
          } catch (e) { toast(e.message || "Could not delete this item.", true); }
        });
        card.append(remove);
        return card;
      }));
      status.hidden = data.length > 0;
    },
  });
}
