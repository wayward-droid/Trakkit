let choice = "system";
try {
  choice = localStorage.getItem("theme") || "system";
} catch {}
const query = matchMedia("(prefers-color-scheme: dark)");
export function setTheme(value) {
  choice = ["light", "dark", "system"].includes(value) ? value : "system";
  document.documentElement.dataset.theme =
    choice === "dark" || (choice === "system" && query.matches)
      ? "dark"
      : "light";
  try {
    localStorage.setItem("theme", choice);
  } catch {}
  document
    .querySelectorAll("[data-theme-select]")
    .forEach((s) => (s.value = choice));
  document.dispatchEvent(new CustomEvent("themechange"));
  return choice;
}
export function bindTheme(onChange) {
  document.querySelectorAll("[data-theme-select]").forEach((s) => {
    s.value = choice;
    s.addEventListener("change", () => {
      setTheme(s.value);
      onChange?.(choice);
    });
  });
}
query.addEventListener("change", () => {
  if (choice === "system") setTheme(choice);
});
window.addEventListener("storage", (e) => {
  if (e.key === "theme") setTheme(e.newValue || "system");
});
