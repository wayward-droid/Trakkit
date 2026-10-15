import { startPage } from "./app.js";
import { listCategories, saveCategory } from "../services/categories.js";
import { canManage } from "../utils/permissions.js";
import { el, message, busy } from "../ui/dom.js";
import { openModal } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
let app;
function categoryForm(existing = null) {
  const workspace = { ...app.workspace }, epoch = app.epoch;
  const modal = openModal(existing ? "Edit category" : "Create a category", workspace.name);
  const form = el("form", { class: "form-stack" });
  const name = el("input", { required: true, maxlength: "40", value: existing?.name || "", placeholder: "e.g. Groceries" });
  const type = el("select", { disabled: Boolean(existing) });
  for (const [value, label] of [["expense", "Expense"], ["income", "Income"]]) type.append(el("option", { value }, label));
  type.value = existing?.type || "expense";
  const color = el("input", { type: "color", value: existing?.color || "#7047eb" });
  const submit = el("button", { type: "submit", class: "button" }, "Save category");
  form.append(el("label", {}, "Category name", name), el("label", {}, "Transaction type", type), el("label", {}, "Category colour", color), el("p", { class: "form-error", role: "alert", hidden: true }), submit);
  modal.content.append(form);
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      if (epoch !== app.epoch) throw new Error("Workspace changed. Reopen this form.");
      const cleanName = name.value.trim();
      if (!cleanName || cleanName.length > 40) throw new Error("Enter a category name up to 40 characters.");
      busy(submit, true);
      await saveCategory(workspace.id, { name: cleanName, type: type.value, color: color.value }, existing?.id);
      modal.close(); toast("Category saved."); await app.refresh();
    } catch (error) { message(form, error.message); }
    finally { busy(submit, false); }
  };
  name.focus();
}
await startPage({
  init: (ctx) => { app = ctx; document.querySelector("#add-category-page").addEventListener("click", () => categoryForm()); },
  load: async (ctx) => {
    const categories = await listCategories(ctx.workspace.id);
    if (!ctx.current()) return;
    document.querySelector("#add-category-page").hidden = !canManage(ctx.workspace);
    const grid = document.querySelector("#category-page-grid");
    grid.replaceChildren(...categories.map((category) => {
      const card = el("article", { class: "category-page-card" });
      const dot = el("span", { class: "category-dot" }); dot.style.backgroundColor = category.color || "#7047eb";
      const name = el("strong", {}, category.name);
      const type = el("span", { class: "subtle" }, category.type === "income" ? "Income" : "Expense");
      const edit = el("button", { type: "button", class: "text-button", hidden: !canManage(ctx.workspace) }, "Edit");
      edit.addEventListener("click", () => categoryForm(category));
      card.append(dot, el("div", { class: "category-page-info" }, name, type), edit);
      return card;
    }));
    document.querySelector("#category-page-empty").hidden = categories.length > 0;
  },
});
