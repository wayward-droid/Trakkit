import { startPage } from "./app.js";
import { pendingApprovals, reviewTransaction } from "../services/approvals.js";
import { formatMoney } from "../utils/money.js";
import { dateLabel } from "../utils/format.js";
import { el, message, busy, emptyState } from "../ui/dom.js";
import { openModal, confirmAction } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
let app,
  page = 0,
  rows = [],
  generation = 0;
function render() {
  document.querySelector("#approval-list").replaceChildren(
    ...rows.map((t) => {
      const info = el(
        "div",
        {},
        el("h3", {}, t.note || t.category_name),
        el(
          "p",
          { class: "subtle" },
          `${t.creator_name} · ${t.category_name} · ${dateLabel(t.transaction_date)}`,
        ),
        el(
          "p",
          { class: "approval-amount" },
          formatMoney(t.amount, t.currency_code),
        ),
      );
      const card = el(
        "article",
        { class: "approval-card" },
        info,
        el("span", { class: "badge submitted" }, "Submitted"),
      );
      const approve = el(
          "button",
          { type: "button", class: "button small" },
          "Approve",
        ),
        reject = el(
          "button",
          { type: "button", class: "button secondary small" },
          "Reject",
        );
      approve.onclick = async () => {
        const w = app.workspace.id,
          epoch = app.epoch;
        if (
          !(await confirmAction(
            "Approve this expense?",
            formatMoney(t.amount_base, app.workspace.base_currency) +
              " will be included in workspace totals.",
            "Approve expense",
          ))
        )
          return;
        try {
          await reviewTransaction(w, t.id, t.revision, "approved");
          if (epoch === app.epoch) {
            toast("Expense approved.");
            await app.refresh();
          }
        } catch (e) {
          toast(e.message, true);
        }
      };
      reject.onclick = () => {
        const w = app.workspace.id,
          epoch = app.epoch,
          m = openModal(
            "Why is this being rejected?",
            t.note || t.category_name,
          ),
          f = el("form", { class: "form-stack" }),
          reason = el("textarea", {
            required: true,
            maxlength: "500",
            placeholder: "Explain what needs correcting.",
          }),
          save = el(
            "button",
            { class: "button", type: "submit" },
            "Reject expense",
          );
        f.append(
          el("label", {}, "Reason", reason),
          el("p", { class: "form-error", hidden: true, role: "alert" }),
          save,
        );
        m.content.append(f);
        f.onsubmit = async (e) => {
          e.preventDefault();
          try {
            busy(save, true);
            await reviewTransaction(
              w,
              t.id,
              t.revision,
              "rejected",
              reason.value,
            );
            m.close();
            if (epoch === app.epoch) {
              toast("Expense rejected.");
              await app.refresh();
            }
          } catch (e) {
            message(f, e.message);
          } finally {
            busy(save, false);
          }
        };
      };
      card.append(el("div", { class: "approval-actions" }, approve, reject));
      return card;
    }),
  );
  if (!rows.length)
    document
      .querySelector("#approval-list")
      .append(
        emptyState(
          "All caught up.",
          "There are no submitted expenses waiting for review.",
        ),
      );
}
await startPage({
  init: (ctx) => {
    app = ctx;
    document.querySelector("#approval-more").onclick = async () => {
      const id = app.workspace.id,
        g = generation,
        button = document.querySelector("#approval-more");
      busy(button, true, "Loading…");
      try {
        const batch = await pendingApprovals(id, page + 1);
        if (g !== generation) return;
        page++;
        rows.push(...batch.rows);
        render();
        button.hidden = rows.length >= batch.total;
      } catch (e) {
        toast(e.message, true);
      } finally {
        busy(button, false);
      }
    };
  },
  load: async (ctx) => {
    generation++;
    page = 0;
    if (
      ctx.workspace.type !== "company" ||
      !["owner", "admin"].includes(ctx.workspace.role)
    )
      throw new Error(
        "Expense review is available to company owners and admins. Switch to a company workspace.",
      );
    const list = await pendingApprovals(ctx.workspace.id);
    if (!ctx.current()) return;
    rows = list.rows;
    document.querySelector("#approval-count").textContent = list.total;
    document.querySelector("#approval-more").hidden = rows.length >= list.total;
    render();
  },
});
