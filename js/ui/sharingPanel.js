import {
  listMembers,
  listInvitations,
  createInvitation,
  acceptInvitation,
  revokeInvitation,
  manageMember,
  transferOwnership,
  updateWorkspace,
} from "../services/sharing.js";
import { listMyWorkspaces } from "../services/workspaces.js";
import { setActiveWorkspace } from "../state/workspaceContext.js";
import { CURRENCIES } from "../utils/money.js";
import { requiredText } from "../utils/validate.js";
import { titleCase } from "../utils/format.js";
import { el, fillSelect, busy, message } from "./dom.js";
import { confirmAction } from "./modal.js";
import { toast } from "./toast.js";

export function bindJoinWorkspace(container, app) {
  const form = el("form", { class: "form-stack", id: "join-workspace-form" }),
    code = el("input", {
      name: "invitation",
      required: true,
      autocomplete: "off",
      placeholder: "Paste the invitation code",
      maxlength: 36,
    }),
    button = el(
      "button",
      { type: "submit", class: "button secondary" },
      "Join workspace",
    );
  form.append(
    el("label", {}, "Invitation code", code),
    el(
      "p",
      { class: "field-help" },
      "Sign in with the confirmed email address the invitation was created for. Codes expire after 7 days.",
    ),
    el("p", { class: "form-error", role: "alert", hidden: true }),
    button,
  );
  container.replaceChildren(el("h2", {}, "Join a shared workspace"), form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    message(form, "");
    busy(button, true, "Joining…");
    try {
      const id = await acceptInvitation(code.value.trim());
      const available = await listMyWorkspaces(app.user.id);
      setActiveWorkspace(id, available);
      code.value = "";
      toast("You joined the workspace.");
      await app.refresh();
    } catch (error) {
      message(form, error.message);
    } finally {
      busy(button, false);
    }
  };
}

export async function renderSharing(container, ctx) {
  const w = ctx.workspace,
    shared = w.type !== "personal",
    manager = ["owner", "admin"].includes(w.role),
    owner = w.role === "owner";
  const [members, invitations] = await Promise.all([
    listMembers(w.id),
    shared && manager ? listInvitations(w.id) : [],
  ]);
  if (!ctx.current()) return;
  const section = el("div", { class: "sharing-grid" });
  const form = el("form", { class: "form-stack", id: "shared-profile-form" }),
    name = el("input", {
      name: "name",
      value: w.name,
      maxlength: 60,
      required: true,
      disabled: !owner,
    }),
    currency = el("select", {
      name: "base_currency",
      disabled: !owner || w.currency_locked,
    }),
    visibility = el("select", { name: "members_see_all", disabled: !owner }),
    save = el(
      "button",
      { type: "submit", class: "button secondary", hidden: !owner },
      "Save workspace profile",
    );
  fillSelect(
    currency,
    CURRENCIES.map((c) => ({ value: c.code, label: c.code + " · " + c.name })),
  );
  currency.value = w.base_currency;
  fillSelect(visibility, [
    { value: "all", label: "Members see all workspace transactions" },
    { value: "own", label: "Members see only their own transactions" },
  ]);
  visibility.value = w.members_see_all ? "all" : "own";
  form.append(
    el("h2", {}, shared ? "Shared workspace profile" : "Workspace profile"),
    el("label", {}, "Workspace name", name),
    el("label", {}, "Base currency", currency),
    el(
      "p",
      { class: "field-help" },
      w.currency_locked
        ? "The accounting currency is fixed because this workspace has financial history. Switch report currency on Overview or Transactions, or choose another currency when adding an entry."
        : "Choose your accounting currency before the first financial entry. Reports can be converted to other currencies at any time.",
    ),
    ...(shared
      ? [
          el("label", {}, "Member visibility", visibility),
          el(
            "p",
            { class: "field-help" },
            "Owners, admins, accountants and viewers can see all transactions. The setting above applies to the member role.",
          ),
        ]
      : []),
    el("p", { class: "form-error", role: "alert", hidden: true }),
    save,
  );
  form.onsubmit = async (event) => {
    event.preventDefault();
    message(form, "");
    busy(save, true);
    try {
      if (!ctx.current()) throw new Error("Workspace changed. Try again.");
      await updateWorkspace(w.id, {
        name: requiredText(name.value, 60, "Workspace name"),
        ...(!w.currency_locked ? { base_currency: currency.value } : {}),
        ...(shared ? { members_see_all: visibility.value === "all" } : {}),
      });
      if (ctx.current()) {
        toast("Workspace profile saved.");
        await ctx.refresh();
      }
    } catch (e) {
      message(form, e.message);
    } finally {
      busy(save, false);
    }
  };
  section.append(form);
  const people = el(
    "section",
    {},
    el("h2", {}, `People · ${members.length}/20`),
  );
  if (!shared)
    people.append(
      el(
        "p",
        { class: "subtle" },
        "Your personal workspace is private. Create a Family or Company workspace above to share finances.",
      ),
    );
  for (const m of members) {
    const row = el(
      "div",
      { class: "member-row" },
      el(
        "div",
        {},
        el(
          "strong",
          {},
          m.display_name + (m.user_id === ctx.user.id ? " (you)" : ""),
        ),
        el("small", {}, titleCase(m.role)),
      ),
    );
    const role = el("select", { "aria-label": "Role for " + m.display_name });
    const roles = [
      "admin",
      ...(w.type === "company" ? ["accountant"] : []),
      "member",
      "viewer",
    ];
    fillSelect(
      role,
      roles.map((r) => ({ value: r, label: titleCase(r) })),
    );
    role.value = m.role;
    async function action(button, title, detail, task) {
      if (
        !ctx.current() ||
        !(await confirmAction(title, detail, "Confirm")) ||
        !ctx.current()
      )
        return;
      busy(button, true);
      try {
        await task();
        if (ctx.current()) {
          toast("Membership updated.");
          await ctx.refresh();
        }
      } catch (e) {
        toast(e.message, true);
      } finally {
        busy(button, false);
      }
    }
    if (shared && manager && m.role !== "owner") {
      const change = el(
        "button",
        { type: "button", class: "text-button" },
        "Save role",
      );
      change.onclick = () =>
        action(
          change,
          "Change this member’s role?",
          `${m.display_name} will become ${role.value} in ${w.name}.`,
          () => manageMember(w.id, m.user_id, role.value),
        );
      row.append(role, change);
      if (owner) {
        const transfer = el(
          "button",
          { type: "button", class: "text-button" },
          "Make owner",
        );
        transfer.onclick = () =>
          action(
            transfer,
            "Transfer ownership?",
            `${m.display_name} becomes the owner. You will become an admin.`,
            () => transferOwnership(w.id, m.user_id),
          );
        row.append(transfer);
      }
    }
    if (
      shared &&
      m.role !== "owner" &&
      (manager || m.user_id === ctx.user.id)
    ) {
      const remove = el(
        "button",
        { type: "button", class: "text-button" },
        m.user_id === ctx.user.id ? "Leave" : "Remove",
      );
      remove.onclick = () =>
        action(
          remove,
          "Remove workspace access?",
          `${m.display_name} will lose access to ${w.name}. Existing transactions remain.`,
          () => manageMember(w.id, m.user_id),
        );
      row.append(remove);
    }
    people.append(row);
  }
  if (shared)
    people.append(
      el(
        "p",
        { class: "field-help" },
        "Admin: manages people and entries. Member: adds entries (expenses only in a company). Viewer: reads reports. Company accountants manage entries but cannot approve expenses or manage people.",
      ),
    );
  section.append(people);
  if (shared && manager) {
    const invite = el("form", { class: "form-stack", id: "invite-form" }),
      email = el("input", {
        name: "email",
        type: "email",
        required: true,
        placeholder: "name@example.com",
      }),
      role = el("select", { name: "role" }),
      send = el(
        "button",
        { type: "submit", class: "button" },
        "Create invitation code",
      );
    fillSelect(
      role,
      [
        "member",
        "viewer",
        "admin",
        ...(w.type === "company" ? ["accountant"] : []),
      ].map((r) => ({ value: r, label: titleCase(r) })),
    );
    invite.append(
      el("h2", {}, "Invite someone"),
      el("label", {}, "Their email address", email),
      el("label", {}, "Role", role),
      el(
        "p",
        { class: "field-help" },
        "Create a code, then copy and share it yourself. No email is sent automatically.",
      ),
      el("p", { class: "form-error", role: "alert", hidden: true }),
      send,
    );
    invite.onsubmit = async (e) => {
      e.preventDefault();
      message(invite, "");
      busy(send, true);
      try {
        if (!ctx.current()) throw new Error("Workspace changed. Try again.");
        await createInvitation(w.id, email.value, role.value);
        if (ctx.current()) {
          toast("Invitation code created.");
          await ctx.refresh();
        }
      } catch (error) {
        message(invite, error.message);
      } finally {
        busy(send, false);
      }
    };
    section.append(invite);
    const pending = el("section", {}, el("h2", {}, "Pending invitations"));
    if (!invitations.length)
      pending.append(el("p", { class: "subtle" }, "No pending invitations."));
    for (const i of invitations) {
      const expired = Date.parse(i.expires_at) <= Date.now(),
        code = el("input", {
          value: i.token,
          readOnly: true,
          "aria-label": "Invitation code for " + i.email,
        }),
        copy = el(
          "button",
          { type: "button", class: "text-button", disabled: expired },
          "Copy code",
        ),
        revoke = el(
          "button",
          { type: "button", class: "text-button" },
          "Revoke",
        );
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(i.token);
          toast("Invitation code copied.");
        } catch {
          code.focus();
          code.select();
          toast("Select and copy the invitation code.");
        }
      };
      revoke.onclick = async () => {
        if (!ctx.current()) return;
        busy(revoke, true);
        try {
          await revokeInvitation(w.id, i.id);
          if (ctx.current()) await ctx.refresh();
        } catch (e) {
          toast(e.message, true);
        } finally {
          busy(revoke, false);
        }
      };
      pending.append(
        el(
          "div",
          { class: "invitation-row" },
          el("strong", {}, i.email),
          el(
            "small",
            {},
            `${titleCase(i.role)} · ${expired ? "Expired" : "Expires " + new Date(i.expires_at).toLocaleDateString()}`,
          ),
          code,
          copy,
          revoke,
        ),
      );
    }
    section.append(pending);
  }
  container.replaceChildren(section);
}
