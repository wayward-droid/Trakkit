import { el } from "./dom.js";
export function openModal(title, subtitle = "") {
  const dialog = el("dialog", { "aria-labelledby": "modal-title" }),
    close = el(
      "button",
      { type: "button", class: "icon-button", "aria-label": "Close dialog" },
      "×",
    );
  close.onclick = () => dialog.close();
  dialog.append(
    el(
      "div",
      { class: "modal-heading" },
      el(
        "div",
        {},
        el("h2", { id: "modal-title" }, title),
        el("p", {}, subtitle),
      ),
      close,
    ),
  );
  const content = el("div");
  dialog.append(content);
  document.querySelector("#modal-root").append(dialog);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  return { dialog, content, close: () => dialog.close() };
}
export function closeModals() {
  document.querySelectorAll("dialog").forEach((d) => d.close());
}
export function confirmAction(title, description, label = "Confirm") {
  return new Promise((resolve) => {
    const m = openModal(title, description),
      cancel = el(
        "button",
        { type: "button", class: "button secondary" },
        "Cancel",
      ),
      ok = el("button", { type: "button", class: "button danger" }, label);
    let done = false;
    cancel.onclick = () => m.close();
    ok.onclick = () => {
      done = true;
      resolve(true);
      m.close();
    };
    m.dialog.addEventListener("close", () => {
      if (!done) resolve(false);
    });
    m.content.append(el("div", { class: "modal-actions" }, cancel, ok));
    cancel.focus();
  });
}
