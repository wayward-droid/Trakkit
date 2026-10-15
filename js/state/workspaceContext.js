let active = null;
let userId = null;
export function initializeWorkspaceContext(id, available) {
  userId = id;
  let saved;
  try {
    saved = localStorage.getItem(`activeWorkspace:${id}`);
  } catch {}
  active =
    available.find((w) => w.id === saved) ||
    available.find((w) => w.type === "personal") ||
    available[0] ||
    null;
  return active;
}
export function setActiveWorkspace(id, available) {
  const next = available.find((w) => w.id === id);
  if (!next || !userId) throw new Error("Workspace unavailable.");
  active = next;
  try {
    localStorage.setItem(`activeWorkspace:${userId}`, id);
  } catch {}
  return active;
}
export const getActiveWorkspace = () => active;
export function clearWorkspaceContext() {
  active = null;
  userId = null;
}
