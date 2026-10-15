import { reviewTransaction } from "../services/approvals.js";
import { startPage } from "./app.js";
import {
  listTransactions,
  deleteTransaction,
  exportTransactions,
} from "../services/transactions.js";
import { listAccounts } from "../services/accounts.js";
import { listCategories } from "../services/categories.js";
import { renderTransactions } from "../ui/transactionRow.js";
import { confirmAction } from "../ui/modal.js";
import { fillSelect, busy, downloadText } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { transactionCsv } from "../utils/csv.js";
import { reportCurrency } from "../ui/reportCurrency.js";
import { reportDownload } from "../ui/reportDownload.js";
let currencyControl;
let rows = [],
  page = 0,
  workspaceId,
  loadId = 0,
  app,
  resetting = false;
const form = document.querySelector("#filters"),
  more = document.querySelector("#load-more");
const filters = () => Object.fromEntries(new FormData(form));
function draw() {
  renderTransactions(document.querySelector("#transaction-list"), rows, {
    workspace: app.workspace,
    userId: app.user.id,
    onResubmit: async (t) => {
      const w = app.workspace.id;
      try {
        await reviewTransaction(w, t.id, t.revision, "submitted");
        if (w === app.workspace.id) {
          toast("Expense resubmitted.");
          await app.refresh();
        }
      } catch (e) {
        toast(e.message, true);
      }
    },
    onEdit: (t) => app.openTransaction(t),
    onDelete: async (t) => {
      const ws = { ...app.workspace };
      if (
        !(await confirmAction(
          "Delete this transaction?",
          "This removes the entry and updates the workspace totals.",
          "Delete transaction",
        ))
      )
        return;
      try {
        await deleteTransaction(ws.id, t.id, t.revision);
        if (ws.id === app.workspace.id) {
          toast("Transaction deleted.");
          await app.refresh();
        }
      } catch (e) {
        toast(e.message, true);
      }
    },
  });
}
await startPage({
  init: (ctx) => {
    app = ctx;
    currencyControl = reportCurrency(
      document.querySelector("#report-currency"),
    );
    reportDownload(
      document.querySelector("#transactions-download"),
      async () => {
        if (!ctx.workspace) throw new Error("Wait for the workspace to load.");
        const workspace = { ...ctx.workspace },
          f = filters(),
          quote = currencyControl.quote();
        if (f.from && f.to && f.from > f.to)
          throw new Error("The start date must be before the end date.");
        return {
          workspace,
          filters: f,
          quote,
          rows: await exportTransactions(workspace.id, f),
        };
      },
    );
    let timer;
    form.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => ctx.refresh(), 350);
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      ctx.refresh();
    });
    form.addEventListener("reset", () => {
      if (!resetting) setTimeout(() => ctx.refresh(), 0);
    });
    more.onclick = async () => {
      const ws = ctx.workspace.id,
        version = loadId;
      busy(more, true, "Loading…");
      try {
        const batch = await listTransactions(ws, {
          ...filters(),
          page: page + 1,
        });
        if (version !== loadId || ws !== ctx.workspace.id) return;
        page++;
        rows.push(...batch.rows);
        draw();
        more.hidden = rows.length >= batch.total;
      } catch (e) {
        toast(e.message, true);
      } finally {
        busy(more, false);
      }
    };
    document.querySelector("#export-csv").onclick = async () => {
      const button = document.querySelector("#export-csv"),
        ws = { ...ctx.workspace },
        f = filters();
      busy(button, true, "Exporting…");
      try {
        const exported = await exportTransactions(ws.id, f);
        downloadText(
          transactionCsv(
            exported.map((r) => ({ ...r, base_currency: ws.base_currency })),
          ),
          `trakkit-${ws.id}-${new Date().toISOString().slice(0, 10)}.csv`,
        );
        toast(
          `Exported ${exported.length} transactions, all matching statuses.`,
        );
      } catch (e) {
        toast(e.message, true);
      } finally {
        busy(button, false);
      }
    };
  },
  load: async (ctx) => {
    loadId++;
    currencyControl.setWorkspace(ctx.workspace, ctx.profile.display_currency);
    page = 0;
    if (workspaceId !== ctx.workspace.id) {
      workspaceId = ctx.workspace.id;
      resetting = true;
      form.reset();
      resetting = false;
    }
    const f = filters();
    if (f.from && f.to && f.from > f.to)
      throw new Error("The start date must be before the end date.");
    const [list, accounts, categories] = await Promise.all([
      listTransactions(ctx.workspace.id, f),
      listAccounts(ctx.workspace.id),
      listCategories(ctx.workspace.id),
    ]);
    if (!ctx.current()) return;
    rows = list.rows;
    fillSelect(form.elements.accountId, accounts, "All accounts");
    fillSelect(form.elements.categoryId, categories, "All categories");
    document.querySelector("#transaction-count").textContent = list.total;
    more.hidden = rows.length >= list.total;
    draw();
  },
});
