import { bindJoinWorkspace, renderSharing } from "../ui/sharingPanel.js";
import { startPage } from "./app.js";
import { updateProfile } from "../services/profile.js";
import { createWorkspace, listMyWorkspaces } from "../services/workspaces.js";
import { setActiveWorkspace } from "../state/workspaceContext.js";
import { CURRENCIES } from "../utils/money.js";
import { requiredText } from "../utils/validate.js";
import { initials, titleCase } from "../utils/format.js";
import { el, fillSelect, message, busy } from "../ui/dom.js";
import { setTheme } from "../ui/theme.js";
import { toast } from "../ui/toast.js";
const profileForm = document.querySelector("#profile-form"),
  workspaceForm = document.querySelector("#workspace-form");
await startPage({
  init: (ctx) => {
    bindJoinWorkspace(document.querySelector("#join-workspace"), ctx);
    fillSelect(
      document.querySelector("#preferred-currency"),
      CURRENCIES.map((c) => ({
        value: c.code,
        label: c.code + " · " + c.name,
      })),
      "Use workspace currency",
    );
    fillSelect(
      document.querySelector("#workspace-currency"),
      CURRENCIES.map((c) => ({
        value: c.code,
        label: c.code + " · " + c.name,
      })),
    );
    workspaceForm.elements.timeZone.value =
      Intl.DateTimeFormat().resolvedOptions().timeZone;
    profileForm.onsubmit = async (e) => {
      e.preventDefault();
      message(profileForm, "");
      const button = profileForm.querySelector("[type=submit]");
      try {
        const input = {
          display_name: requiredText(
            profileForm.elements.display_name.value,
            80,
            "Your name",
          ),
          theme: profileForm.elements.theme.value,
          display_currency: profileForm.elements.display_currency.value || null,
        };
        busy(button, true);
        await updateProfile(ctx.user.id, input);
        ctx.profile = { ...ctx.profile, ...input };
        setTheme(input.theme);
        document
          .querySelectorAll("[data-user-name]")
          .forEach((n) => (n.textContent = input.display_name));
        document
          .querySelectorAll("[data-initials]")
          .forEach((n) => (n.textContent = initials(input.display_name)));
        toast("Preferences saved.");
      } catch (e) {
        message(profileForm, e.message);
      } finally {
        busy(button, false);
      }
    };
    workspaceForm.onsubmit = async (e) => {
      e.preventDefault();
      message(workspaceForm, "");
      const button = workspaceForm.querySelector("[type=submit]");
      try {
        const input = {
          name: requiredText(
            workspaceForm.elements.name.value,
            60,
            "Workspace name",
          ),
          type: workspaceForm.elements.type.value,
          baseCurrency: workspaceForm.elements.baseCurrency.value,
          timeZone: workspaceForm.elements.timeZone.value,
        };
        new Intl.DateTimeFormat("en", { timeZone: input.timeZone });
        busy(button, true);
        const id = await createWorkspace(input),
          available = await listMyWorkspaces(ctx.user.id);
        setActiveWorkspace(id, available);
        toast("Workspace created. Your first Cash account is ready.");
        workspaceForm.elements.name.value = "";
        await ctx.refresh();
      } catch (e) {
        message(workspaceForm, e.message);
      } finally {
        busy(button, false);
      }
    };
  },
  load: async (ctx) => {
    await renderSharing(document.querySelector("#sharing-panel"), ctx);
    if (!ctx.current()) return;
    profileForm.elements.display_name.value = ctx.profile.display_name;
    profileForm.elements.theme.value = ctx.profile.theme;
    profileForm.elements.display_currency.value =
      ctx.profile.display_currency || "";
    document.querySelector("#profile-email").value = ctx.user.email;
    document.querySelector("#current-workspace-name").textContent =
      ctx.workspace.name;
    workspaceForm.elements.baseCurrency.value = ctx.workspace.base_currency;
    document.querySelector("#workspace-details").replaceChildren(
      ...[
        ["Type", titleCase(ctx.workspace.type)],
        ["Your role", titleCase(ctx.workspace.role)],
        [
          "Base currency",
          ctx.workspace.base_currency +
            (ctx.workspace.currency_locked ? " · Locked" : ""),
        ],
        ["Time zone", ctx.workspace.time_zone],
      ].map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", {}, v))),
    );
  },
});
