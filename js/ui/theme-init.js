// Classic script: runs before styles to avoid a flash of the wrong theme.
(() => {
  let choice = "system";
  try {
    choice = localStorage.getItem("theme") || "system";
  } catch {}
  if (!["light", "dark", "system"].includes(choice)) choice = "system";
  document.documentElement.dataset.theme =
    choice === "dark" ||
    (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
      ? "dark"
      : "light";
})();
