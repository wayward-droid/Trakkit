import { pendingApprovals } from "../services/approvals.js";
import { session, observeAuth, logOut } from "../services/auth.js";
import { listMyWorkspaces } from "../services/workspaces.js";
import { getProfile, updateProfile } from "../services/profile.js";
import { listAccounts, addAccount, balances } from "../services/accounts.js";
import { listCategories } from "../services/categories.js";
import { saveTransaction } from "../services/transactions.js";
import { quoteTransaction } from "../services/rates.js";
import {
  initializeWorkspaceContext,
  setActiveWorkspace,
  clearWorkspaceContext,
} from "../state/workspaceContext.js";
import { bindTheme, setTheme } from "../ui/theme.js";
import { fillSelect } from "../ui/dom.js";
import { toast } from "../ui/toast.js";
import { closeModals } from "../ui/modal.js";
import { transactionForm } from "../ui/transactionForm.js";
import { canWrite, ownOnly } from "../utils/permissions.js";
import { initials, titleCase } from "../utils/format.js";
const $ = (s) => document.querySelector(s);
/** Page orchestration: owns session, workspace choice, and stale response checks. */
export async function startPage({ load, init }) {
  const ctx = {
    user: null,
    workspace: null,
    workspaces: [],
    profile: null,
    epoch: 0,
  };
  let ticket = 0,
    ready = false;
  function fail(e) {
    $("#page-error p").textContent =
      e.message ||
      "Unable to load your workspace. Check your connection and try again.";
    $("#page-error").hidden = false;
    $("#page-loading").hidden = true;
    $("#page-content").hidden = true;
    document
      .querySelectorAll("[data-add-transaction]")
      .forEach((b) => (b.disabled = true));
  }

  ctx.refresh = async () => {
    const current = ++ticket;
    ctx.epoch++;
    closeModals();
    $("#page-content").hidden = true;
    $("#page-error").hidden = true;
    $("#page-loading").hidden = false;
    document
      .querySelectorAll("[data-add-transaction]")
      .forEach((b) => (b.disabled = true));
    try {
      const workspaces = await listMyWorkspaces(ctx.user.id);
      if (current !== ticket) return;
      ctx.workspaces = workspaces;
      ctx.workspace = initializeWorkspaceContext(ctx.user.id, workspaces);
      if (!ctx.workspace)
        throw new Error(
          "No workspace is available. Check the initial database migration, then sign in again.",
        );
      fillSelect(
        $("#workspace-switcher"),
        workspaces.map((w) => ({ value: w.id, label: w.name })),
      );
      $("#workspace-switcher").value = ctx.workspace.id;
      $("#workspace-switcher").disabled = false;
      $("#workspace-meta").textContent =
        titleCase(ctx.workspace.type) + " · " + ctx.workspace.base_currency;
      $("#scope-note").textContent = ownOnly(ctx.workspace)
        ? "Your approved transactions only"
        : "Approved transactions in your workspace";
      const reviewable =
        ctx.workspace.type === "company" &&
        ["owner", "admin"].includes(ctx.workspace.role);
      document
        .querySelectorAll("[data-review-link]")
        .forEach((n) => (n.hidden = !reviewable));
      const view = {
        ...ctx,
        workspace: { ...ctx.workspace },
        current: () => current === ticket,
      };
      const [, pending] = await Promise.all([
        load(view),
        reviewable ? pendingApprovals(ctx.workspace.id) : Promise.resolve(null),
      ]);
      if (current !== ticket) return;
      document
        .querySelectorAll("[data-approval-badge]")
        .forEach((n) => (n.textContent = pending?.total || ""));
      $("#page-loading").hidden = true;
      $("#page-content").hidden = false;
      if (["#reports", "#categories", "#sharing-panel"].includes(location.hash)) {
        const target = document.querySelector(location.hash);
        target?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      }
      document.querySelectorAll("[data-add-transaction]").forEach((b) => {
        b.hidden = !canWrite(ctx.workspace);
        b.disabled = false;
      });
    } catch (e) {
      if (current === ticket) fail(e);
    }
  };
  ctx.openTransaction = async (existing) => {
    const workspace = { ...ctx.workspace },
      epoch = ctx.epoch;
    try {
      const [accounts, categories, accountBalances] = await Promise.all([
        listAccounts(workspace.id),
        listCategories(workspace.id),
        balances(workspace.id),
      ]);
      if (epoch !== ctx.epoch) return;
      const balanceById = new Map(
        (accountBalances.accounts || []).map((account) => [account.id, account.balance]),
      );
      const accountsWithBalances = accounts.map((account) => ({
        ...account,
        balance: balanceById.has(account.id) ? balanceById.get(account.id) : null,
      }));
      transactionForm({
        workspace,
        accounts: accountsWithBalances,
        categories,
        existing,
        onQuote: quoteTransaction,
        onCreateAccount: async (currency) => {
          if (epoch !== ctx.epoch)
            throw new Error("The workspace changed. Reopen the form.");
          return addAccount(workspace.id, {
            name: `Cash ${currency}`,
            type: "cash",
            currency_code: currency,
            opening_balance: "0",
          });
        },
        onSave: async (input, old) => {
          if (epoch !== ctx.epoch)
            throw new Error("The workspace changed. Reopen the form.");
          const saved = await saveTransaction(workspace.id, input, old);
          if (epoch !== ctx.epoch) return;
          toast(
            saved.status === "submitted"
              ? "Saved. This expense is awaiting approval."
              : "Transaction saved.",
          );
          await ctx.refresh();
        },
      });
    } catch (e) {
      toast(e.message, true);
    }
  };
  $("#page-retry").addEventListener("click", () =>
    ready ? ctx.refresh() : location.reload(),
  );
  bindTheme(async (theme) => {
    if (ctx.user)
      try {
        await updateProfile(ctx.user.id, { theme });
        ctx.profile.theme = theme;
      } catch {
        toast(
          "Theme changed on this device. Sync failed; save it again in Settings.",
          true,
        );
      }
  });
  try {
    const s = await session();
    if (!s) {
      location.replace("index.html");
      return null;
    }
    ctx.user = s.user;
    await observeAuth((event) => {
      if (event === "SIGNED_OUT") {
        ticket++;
        clearWorkspaceContext();
        closeModals();
        $("#page-content").replaceChildren();
        location.replace("index.html");
      }
    });
    ctx.profile = await getProfile(ctx.user.id);
    setTheme(ctx.profile.theme || "system");
    document
      .querySelectorAll("[data-user-name]")
      .forEach((n) => (n.textContent = ctx.profile.display_name));
    document
      .querySelectorAll("[data-initials]")
      .forEach((n) => (n.textContent = initials(ctx.profile.display_name)));
    document.querySelectorAll("[data-nav]").forEach((a) => {
      if (a.dataset.nav === document.body.dataset.page)
        a.setAttribute("aria-current", "page");
    });
    document.querySelectorAll("[data-logout]").forEach((b) =>
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          await logOut();
          ticket++;
          clearWorkspaceContext();
          $("#page-content").replaceChildren();
          location.href = "index.html";
        } catch (e) {
          b.disabled = false;
          toast(e.message, true);
        }
      }),
    );
    $("#workspace-switcher").addEventListener("change", () => {
      try {
        setActiveWorkspace($("#workspace-switcher").value, ctx.workspaces);
        ctx.refresh();
      } catch (e) {
        fail(e);
      }
    });
    document
      .querySelectorAll("[data-add-transaction]")
      .forEach((b) => b.addEventListener("click", () => ctx.openTransaction()));

    await init?.(ctx);
    ready = true;
    await ctx.refresh();
    // Revalidate roles on returning to the tab; no client preference proves access.
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !document.querySelector("dialog[open]"))
        ctx.refresh();
    });
    return ctx;
  } catch (e) {
    fail(e);
    return null;
  }
}
