// DOM integration checks, not browser rendering or accessibility certification.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { databaseClient } from "./helpers/database-client.mjs";
const modulePath = process.env.EXPENSE_QA_MODULES
  ? pathToFileURL(process.env.EXPENSE_QA_MODULES + "/jsdom/lib/api.js").href
  : "jsdom";
const { JSDOM } = await import(modulePath);
const source = existsSync(new URL("../dist/index.html", import.meta.url))
  ? new URL("../dist/", import.meta.url)
  : new URL("../", import.meta.url);
await test("Authenticated application flows", async (t) => {
  // Configuration is injected into a temporary test copy; shipped settings stay blank.
  const directory = await fs.mkdtemp(path.join(tmpdir(), "expense-interface-"));
  const root = pathToFileURL(directory + "/");
  await fs.cp(source, directory, { recursive: true });
  await fs.writeFile(new URL("package.json", root), '{"type":"module"}');
  await fs.writeFile(
    new URL("js/config.js", root),
    'export const SUPABASE_URL="https://database.test"; export const SUPABASE_ANON_KEY="public-test-key";',
  );
  const { db, client, user, personalId, state } = await databaseClient();
  globalThis.supabase = { createClient: () => client };
  let dom,
    pageId = 0;
  t.after(async () => {
    dom?.window.close();
    await db.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const { saveTransaction } = await import(
    new URL("js/services/transactions.js", root)
  );
  const { createWorkspace } = await import(
    new URL("js/services/workspaces.js", root)
  );
  const { listAccounts } = await import(
    new URL("js/services/accounts.js", root)
  );
  const { listCategories } = await import(
    new URL("js/services/categories.js", root)
  );
  const { today } = await import(new URL("js/utils/format.js", root));
  const initialAccounts = await listAccounts(personalId);
  const initialCategories = await listCategories(personalId);
  for (let i = 0; i < 24; i++)
    await saveTransaction(personalId, {
      id: crypto.randomUUID(),
      account_id: initialAccounts[0].id,
      category_id: initialCategories.find((c) => c.type === "income").id,
      type: "income",
      amount: "25",
      transaction_date: today("Africa/Lagos"),
      note: "Integration entry " + i,
      rate_source: "auto",
    });
  async function page(name, workspaceId, suffix = "") {
    dom?.window.close();
    state.listeners.clear();
    dom = new JSDOM(await fs.readFile(new URL(name + ".html", root), "utf8"), {
      url: "https://example.test/" + name + ".html" + suffix,
      pretendToBeVisual: true,
    });
    for (const key of [
      "window",
      "document",
      "Node",
      "HTMLElement",
      "Event",
      "CustomEvent",
      "FormData",
      "localStorage",
    ])
      globalThis[key] = dom.window[key];
    globalThis.location = {
      href: dom.window.location.href,
      hash: dom.window.location.hash,
      search: dom.window.location.search,
      replace(value) {
        this.href = value;
      },
      reload() {},
    };
    globalThis.getComputedStyle = dom.window.getComputedStyle;
    globalThis.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
    dom.window.matchMedia = globalThis.matchMedia;
    dom.window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    dom.window.HTMLDialogElement.prototype.close = function () {
      this.open = false;
      this.dispatchEvent(new dom.window.Event("close"));
    };
    if (workspaceId)
      localStorage.setItem("activeWorkspace:" + user.id, workspaceId);
    await import(
      new URL("js/pages/" + name + ".js", root).href + "?test=" + ++pageId
    );
  }
  async function until(fn) {
    for (let i = 0; i < 40; i++) {
      if (await fn()) return;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.fail(
      "Interface did not reach expected state. " +
        document.querySelector("#page-error")?.textContent +
        " " +
        [...document.querySelectorAll(".form-error,.toast.error")]
          .map((n) => n.textContent)
          .join(" "),
    );
  }
  await t.test(
    "Signed-in dashboard reads PostgreSQL data and saves an expense through the form",
    async () => {
      await page("dashboard");
      assert.equal(document.querySelector("#page-error").hidden, true);
      assert.equal(document.querySelector("#page-content").hidden, false);
      assert.equal(document.querySelectorAll("#trend-data tr").length, 6);
      const before = document.querySelector("#expense-value").textContent;
      document.querySelector("[data-add-transaction]").click();
      await until(() => document.querySelector("dialog"));
      const f = document.querySelector("dialog form");
      f.elements.amount.value = "105.25";
      f.elements.note.value = "DOM integration expense";
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await until(
        () =>
          !document.querySelector("dialog") &&
          !document.querySelector("#page-content").hidden,
      );
      assert.notEqual(
        document.querySelector("#expense-value").textContent,
        before,
      );
      assert.match(
        document.querySelector("#recent-transactions").textContent,
        /DOM integration expense/,
      );
      document.querySelector("[data-theme-select]").value = "dark";
      document
        .querySelector("[data-theme-select]")
        .dispatchEvent(new Event("change", { bubbles: true }));
      assert.equal(document.documentElement.dataset.theme, "dark");
    },
  );
  await t.test(
    "Transactions filters, edit, deletion confirmation and load-more are wired",
    async () => {
      await page("transactions");
      assert.equal(document.querySelector("#page-content").hidden, false);
      assert.equal(
        document.querySelectorAll("#transaction-list tbody tr").length,
        20,
      );
      document.querySelector("#load-more").click();
      await until(
        () =>
          document.querySelectorAll("#transaction-list tbody tr").length === 25,
      );
      const filter = document.querySelector("#filters");
      filter.elements.search.value = "DOM integration expense";
      filter.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await until(
        () => document.querySelector("#transaction-count").textContent === "1",
      );
      document
        .querySelector('#transaction-list button[aria-label^="Edit"]')
        .click();
      await until(() => document.querySelector("dialog"));
      let f = document.querySelector("dialog form");
      f.elements.amount.value = "210.50";
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await until(
        () =>
          !document.querySelector("dialog") &&
          !document.querySelector("#page-content").hidden,
      );
      assert.match(
        document.querySelector("#transaction-list").textContent,
        /210\.50/,
      );
      document.querySelector("#transaction-list .delete-action").click();
      await until(() => document.querySelector("dialog"));
      document.querySelector("dialog .button.danger").click();
      await until(
        () => document.querySelector("#transaction-count").textContent === "0",
      );
      assert.match(
        document.querySelector("#transaction-list").textContent,
        /A fresh page/,
      );
    },
  );
  await t.test(
    "Accounts and settings create scoped data through their actual forms",
    async () => {
      await page("accounts");
      assert.equal(document.querySelectorAll(".account-card").length, 1);
      document.querySelector("#add-account").click();
      const form = document.querySelector("dialog form");
      const inputs = form.querySelectorAll("input");
      inputs[0].value = "Test wallet";
      inputs[1].value = "50.00";
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await until(
        () =>
          !document.querySelector("dialog") &&
          document.querySelectorAll(".account-card").length === 2,
      );
      await page("settings");
      const ws = document.querySelector("#workspace-form");
      ws.elements.name.value = "Family test";
      ws.elements.type.value = "family";
      ws.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await until(
        () =>
          document.querySelector("#current-workspace-name").textContent ===
          "Family test",
      );
      assert.equal(
        document.querySelector("#workspace-switcher").options.length,
        2,
      );
    },
  );
  await t.test(
    "Company corrections can be reviewed to completion from the approvals page",
    async () => {
      const id = await createWorkspace({
        name: "Company review",
        type: "company",
        baseCurrency: "NGN",
        timeZone: "UTC",
      });
      const a = (await listAccounts(id))[0];
      const c = (await listCategories(id)).find((c) => c.type === "expense");
      const input = {
        id: crypto.randomUUID(),
        account_id: a.id,
        category_id: c.id,
        type: "expense",
        amount: "100",
        transaction_date: today("UTC"),
        note: "A company expense",
        rate_source: "auto",
      };
      const saved = await saveTransaction(id, input);
      await saveTransaction(
        id,
        { ...input, amount: "200", exchange_rate: saved.exchange_rate },
        saved,
      );
      await page("approvals", id);
      assert.equal(document.querySelector("#approval-count").textContent, "1");
      document.querySelector(".approval-actions .button").click();
      await until(() => document.querySelector("dialog"));
      document.querySelector("dialog .button.danger").click();
      await until(
        () => document.querySelector("#approval-count").textContent === "0",
      );
      assert.match(
        document.querySelector("#approval-list").textContent,
        /All caught up/,
      );
    },
  );

  await t.test(
    "Yearly income, report currency, and today-only entry controls work together",
    async () => {
      await page("dashboard", personalId);
      const w = { id: personalId, time_zone: "Africa/Lagos" };
      const { formatMoney } = await import(new URL("js/utils/money.js", root));
      const { yearlySummary } = await import(
        new URL("js/services/reports.js", root)
      );
      const expected = await yearlySummary(
        w.id,
        Number(today(w.time_zone).slice(0, 4)),
      );
      assert.equal(expected.income, "600.00");
      assert.equal(
        document.querySelector("#income-value").textContent,
        formatMoney(expected.income, "NGN"),
      );
      assert.match(
        document.querySelector("#income-period").textContent,
        /1 Jan – 31 Dec/,
      );
      const f = document.querySelector(".report-controls");
      f.elements.report_currency.value = "USD";
      f.elements.report_currency.dispatchEvent(new Event("change"));
      f.elements.report_rate.value = "0.001";
      f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await until(() =>
        document
          .querySelector(".report-rate-note")
          .textContent.includes("manual rate"),
      );
      assert.match(document.querySelector("#income-value").textContent, /\$/);
      document.querySelector("[data-add-transaction]").click();
      await until(() => document.querySelector("dialog"));
      const entry = document.querySelector("dialog form");
      assert.equal(entry.elements.date.min, today(w.time_zone));
      assert.equal(entry.elements.date.max, today(w.time_zone));
      entry.elements.currency.value = "USD";
      entry.elements.currency.dispatchEvent(new Event("change"));
      const create = [...entry.querySelectorAll("button")].find(
        (b) => b.textContent === "Create a USD cash account",
      );
      create.click();
      await until(() => entry.elements.account.options.length === 1);
      assert.match(entry.elements.account.options[0].textContent, /USD/);
      entry.elements.amount.value = "10";
      entry.elements.rate_mode.value = "manual";
      entry.elements.manual_rate.value = "1500";
      entry.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await until(
        () =>
          !document.querySelector("dialog") &&
          !document.querySelector("#page-content").hidden,
      );
      const { listTransactions } = await import(
        new URL("js/services/transactions.js", root)
      );
      const added = (await listTransactions(personalId)).rows.find(
        (t) => t.currency_code === "USD",
      );
      assert.equal(added.amount_base, "15000.00");
    },
  );
  await t.test(
    "Shared workspace profile, invitations and preferred report currency are usable",
    async () => {
      await page("settings", personalId);
      const create = document.querySelector("#workspace-form");
      create.elements.name.value = "Our shared profile";
      create.elements.type.value = "family";
      create.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await until(() => document.querySelector("#invite-form"));
      const profile = document.querySelector("#shared-profile-form");
      profile.elements.name.value = "Our home";
      profile.elements.base_currency.value = "USD";
      profile.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await until(
        () =>
          document.querySelector("#current-workspace-name").textContent ===
          "Our home",
      );
      const invite = document.querySelector("#invite-form");
      invite.elements.email.value = "friend@example.test";
      invite.elements.role.value = "viewer";
      invite.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await until(() => document.querySelector(".invitation-row"));
      assert.match(
        document.querySelector(".invitation-row").textContent,
        /friend@example.test/,
      );
      document.querySelector(".invitation-row input").focus();
      const revoke = [
        ...document.querySelectorAll(".invitation-row button"),
      ].find((b) => b.textContent === "Revoke");
      revoke.click();
      await until(() => !document.querySelector(".invitation-row"));
      const prefs = document.querySelector("#profile-form");
      prefs.elements.display_currency.value = "EUR";
      prefs.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await until(
        async () =>
          (
            await db.query(
              "select display_currency from public.profiles where id=$1",
              [user.id],
            )
          ).rows[0].display_currency === "EUR",
      );
    },
  );

  await t.test(
    "Sign-out clears the page and every protected page requires a session",
    async () => {
      await page("dashboard", personalId);
      document.querySelector("[data-logout]").click();
      await until(() => location.href === "index.html");
      assert.equal(state.session, null);
      assert.equal(
        document.querySelector("#page-content").childElementCount,
        0,
      );
      for (const name of [
        "dashboard",
        "transactions",
        "accounts",
        "approvals",
        "settings",
      ]) {
        await page(name);
        assert.equal(location.href, "index.html");
        assert.equal(document.querySelector("#page-content").hidden, true);
      }
    },
  );

  await t.test(
    "Account forms call Supabase Auth and password fields toggle independently",
    async () => {
      const submit = (form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      function checkPasswordButtons() {
        const fields = [...document.querySelectorAll("input[type=password]")];
        for (const button of document.querySelectorAll(
          "[data-toggle-password]",
        )) {
          const field = document
            .querySelector("#auth-form")
            .elements.namedItem(button.dataset.togglePassword || "password");
          button.click();
          assert.equal(field.type, "text");
          assert.equal(button.getAttribute("aria-pressed"), "true");
          for (const other of fields.filter((f) => f !== field))
            assert.equal(other.type, "password");
          button.click();
          assert.equal(field.type, "password");
          assert.equal(button.getAttribute("aria-pressed"), "false");
        }
        return fields.length;
      }
      await page("signup");
      assert.equal(checkPasswordButtons(), 2);
      let form = document.querySelector("#auth-form");
      form.elements.display_name.value = "New User";
      form.elements.email.value = "new@example.test";
      form.elements.password.value = "Test-password-123";
      form.elements.confirm_password.value = "mismatch";
      submit(form);
      await until(() =>
        form.querySelector(".form-error").textContent.includes("do not match"),
      );
      assert.equal(
        state.calls.some((c) => c.name === "signUp"),
        false,
      );
      form.elements.confirm_password.value = form.elements.password.value;
      submit(form);
      await until(() =>
        form
          .querySelector(".form-success")
          .textContent.includes("confirm your account"),
      );
      const signup = state.calls.find((c) => c.name === "signUp").value;
      assert.equal(signup.options.data.display_name, "New User");
      assert.equal(signup.options.data.base_currency, "NGN");
      assert.equal(form.elements.password.value, "");
      assert.equal(form.elements.confirm_password.value, "");

      await page("index");
      assert.equal(checkPasswordButtons(), 1);
      form = document.querySelector("#auth-form");
      form.elements.email.value = user.email;
      form.elements.password.value = "Test-password-123";
      state.loginError = new Error("Invalid credentials");
      submit(form);
      await until(() =>
        form
          .querySelector(".form-error")
          .textContent.includes("Unable to sign in"),
      );
      state.loginError = null;
      submit(form);
      await until(() => location.href === "dashboard.html");
      assert.equal(
        state.calls.find((c) => c.name === "signInWithPassword").value.email,
        user.email,
      );

      await page("forgot-password");
      form = document.querySelector("#auth-form");
      form.elements.email.value = user.email;
      submit(form);
      await until(() =>
        form.querySelector(".form-success").textContent.includes("reset link"),
      );
      const recovery = state.calls.find(
        (c) => c.name === "resetPasswordForEmail",
      ).value;
      assert.equal(recovery.email, user.email);
      assert.ok(recovery.options.redirectTo.endsWith("/reset.html"));

      await page("reset");
      assert.equal(checkPasswordButtons(), 2);
      assert.equal(document.querySelector("[type=submit]").disabled, true);
      assert.match(
        document.querySelector(".form-error").textContent,
        /latest password reset link/,
      );
      await page("reset", null, "#type=recovery");
      form = document.querySelector("#auth-form");
      assert.equal(form.querySelector("[type=submit]").disabled, false);
      form.elements.password.value = "Replacement-password-123";
      form.elements.confirm_password.value = form.elements.password.value;
      submit(form);
      await until(() =>
        form
          .querySelector(".form-success")
          .textContent.includes("Password updated"),
      );
      assert.equal(
        state.calls.find((c) => c.name === "updateUser").value.password,
        "Replacement-password-123",
      );
    },
  );
});
