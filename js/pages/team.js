import { startPage } from "./app.js";
import { listMembers } from "../services/sharing.js";
import { initials, titleCase } from "../utils/format.js";
import { el } from "../ui/dom.js";
await startPage({
  load: async (ctx) => {
    const members = await listMembers(ctx.workspace.id);
    if (!ctx.current()) return;
    document.querySelector("#team-workspace-name").textContent = ctx.workspace.name;
    document.querySelector("#team-workspace-type").textContent = titleCase(ctx.workspace.type) + " workspace";
    document.querySelector("#team-your-role").textContent = titleCase(ctx.workspace.role);
    document.querySelector("#team-member-count").textContent = String(members.length);
    const list = document.querySelector("#team-members");
    list.replaceChildren(...members.map((member) => {
      const avatar = el("span", { class: "avatar" }, initials(member.display_name));
      const details = el("div", { class: "team-member-details" }, el("strong", {}, member.display_name), el("span", { class: "subtle" }, member.user_id === ctx.user.id ? `${ctx.user.email} · You` : "Workspace member"));
      const role = el("span", { class: "team-role" }, titleCase(member.role));
      return el("article", { class: "team-member" }, avatar, details, role);
    }));
  },
});
