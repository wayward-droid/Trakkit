export function toast(text, error = false) {
  const region = document.querySelector("#toast-region");
  if (!region) return;
  const item = document.createElement("div");
  item.className = "toast" + (error ? " error" : "");
  item.textContent = text;
  region.append(item);
  setTimeout(() => item.remove(), 6000);
}
