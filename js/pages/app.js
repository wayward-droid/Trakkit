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

/* ---------------------------------------------------------------------------
   Shared application shell
   Every signed-in page renders one bottom navigation with a single "More"
   toggle. Pages that are not shown on the bottom bar (reports, categories,
   company & team, budgets, goals, recurring bills, approvals and settings)
   plus sign-out live inside that toggle. The topbar shows the Trakkit brand
   instead of a logout button.
--------------------------------------------------------------------------- */
const NAV_ICONS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect>',
  transactions:
    '<path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"></path>',
  accounts:
    '<rect x="3" y="5" width="18" height="15" rx="3"></rect><path d="M3 9h18m-6 5h6"></path><circle cx="16" cy="14" r=".5"></circle>',
  reports:
    '<path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-5 5"></path>',
  categories:
    '<path d="M20.6 13.4 11 3.8A2 2 0 0 0 9.6 3H4a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.4a2 2 0 0 0 0-2.8Z"></path><circle cx="7.5" cy="7.5" r=".8"></circle>',
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="10" cy="7" r="4"></circle><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path>',
  budgets:
    '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 10h18M7 15h3"></path>',
  goals:
    '<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle>',
  recurring:
    '<rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M16 2v4M8 2v4M3 9h18m-13 4h3m-3 4h6"></path>',
  approvals:
    '<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.2 2.4 2.4 4.6-5"></path>',
  settings:
    '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1m-8.6 8.6-2.1 2.1"></path><circle cx="12" cy="12" r="5"></circle>',
  logout: '<path d="M10 4H5v16h5m4-13 5 5-5 5m-5-5h10"></path>',
};
const navIcon = (name) =>
  `<svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[name]}</svg>`;

function buildMobileNav() {
  const primary = [
    ["dashboard.html", "dashboard", "Overview"],
    ["transactions.html", "transactions", "Transactions"],
    ["accounts.html", "accounts", "Accounts"],
  ];
  const secondary = [
    ["reports.html", "reports", "Reports"],
    ["categories.html", "categories", "Categories"],
    ["team.html", "team", "Company &amp; team"],
    ["budgets.html", "budgets", "Budgets"],
    ["goals.html", "goals", "Savings goals"],
    ["recurring.html", "recurring", "Recurring bills"],
  ];
  const nav = document.createElement("nav");
  nav.className = "mobile-nav";
  nav.setAttribute("aria-label", "Mobile");
  nav.innerHTML = [
    ...primary.map(
      ([href, key, label]) =>
        `<a href="${href}" data-nav="${key}">${navIcon(key)}<span>${label}</span></a>`,
    ),
    `<details class="mobile-more">
      <summary><span aria-hidden="true">☰</span><span>More</span></summary>
      <div>
        ${secondary
          .map(
            ([href, key, label]) =>
              `<a href="${href}" data-nav="${key}">${navIcon(key)}<span>${label}</span></a>`,
          )
          .join("")}
        <a href="approvals.html" data-nav="approvals" data-review-link hidden>${navIcon("approvals")}<span>Approvals</span><span class="count-badge" data-approval-badge=""></span></a>
        <a href="settings.html" data-nav="settings">${navIcon("settings")}<span>Settings</span></a>
        <button type="button" data-logout>${navIcon("logout")}<span>Log out</span></button>
      </div>
    </details>`,
  ].join("");
  const closeMore = () => {
    const more = nav.querySelector(".mobile-more");
    if (more) more.open = false;
  };
  nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", closeMore));
  document.addEventListener("click", (event) => {
    const more = nav.querySelector(".mobile-more");
    if (more && more.open && !more.contains(event.target)) closeMore();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMore();
  });
  return nav;
}

function ensureAppShell() {
  const topbar = document.querySelector(".topbar");
  if (topbar && !topbar.querySelector("[data-topbar-brand]")) {
    const brand = document.createElement("a");
    brand.className = "topbar-brand";
    brand.href = "dashboard.html";
    brand.setAttribute("data-topbar-brand", "");
    brand.setAttribute("aria-label", "Trakkit home");
    brand.innerHTML =
      '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="brand-word">Trakkit</span>';
    topbar.prepend(brand);
  }
  if (!document.querySelector(".mobile-nav")) document.body.append(buildMobileNav());
}

/** Page orchestration: owns session, workspace choice, and stale response checks. */
export async function startPage({ load, init }) {
  ensureAppShell();
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
    // Keep error handling resilient across pages whose markup may differ slightly.
    // Previously, a missing <p> inside #page-error caused this handler to throw
    // and hide the real error behind "Cannot set properties of null (textContent)".
    const errorPanel = $("#page-error");
    if (errorPanel) {
      let errorText = errorPanel.querySelector("p, [data-error-message]");
      if (!errorText) {
        errorText = document.createElement("p");
        errorPanel.prepend(errorText);
      }
      const missingPlanningTable = ["PGRST205", "42P01", "42703"].includes(e?.code) ||
        /could not find the table .*budgets|could not find the table .*savings_goals|could not find the table .*recurring_bills|relation .* does not exist|column .*\.name does not exist/i.test(e?.message || "");
      errorText.textContent = missingPlanningTable
        ? "The planning tables need repair. In your Supabase SQL Editor, run supabase/migrations/008_fix_planning_and_rate_cache.sql, wait for it to succeed, then reload this page."
        : e?.message || "Unable to load your workspace. Check your connection and try again.";
      errorPanel.hidden = false;
    } else {
      console.error("Trakkit page failed to load:", e);
    }
    const loading = $("#page-loading");
    if (loading) loading.hidden = true;
    const content = $("#page-content");
    if (content) content.hidden = true;
    document.querySelectorAll("[data-add-transaction]").forEach((b) => {
      b.disabled = true;
    });
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
      const scopeNote = $("#scope-note");
      // Scope guidance is only present on pages where it is relevant.
      // Do not let its absence break unrelated pages such as Categories, Reports, or Team.
      if (scopeNote) {
        scopeNote.textContent = ownOnly(ctx.workspace)
          ? "Your approved transactions only"
          : "Approved transactions in your workspace";
      }
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
