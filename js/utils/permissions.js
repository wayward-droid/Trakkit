export const canWrite = (w) =>
  ["owner", "admin", "accountant", "member"].includes(w.role);
export const canManage = (w) =>
  ["owner", "admin", "accountant"].includes(w.role);
export const canIncome = (w) =>
  canWrite(w) && !(w.type === "company" && w.role === "member");
export const canEdit = (w, t, userId) =>
  canManage(w) ||
  (w.role === "member" &&
    t.created_by === userId &&
    !(w.type === "company" && t.status === "approved"));
export const ownOnly = (w) => w.role === "member" && !w.members_see_all;
