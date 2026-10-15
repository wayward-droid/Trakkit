/** Create an element; user values are always text nodes or DOM properties. */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on"))
      node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (
      [
        "value",
        "checked",
        "disabled",
        "hidden",
        "required",
        "readOnly",
      ].includes(k)
    )
      node[k] = v;
    else node.setAttribute(k, String(v));
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(
      child instanceof Node ? child : document.createTextNode(String(child)),
    );
  }
  return node;
}
export function fillSelect(select, options, first) {
  const value = select.value;
  select.replaceChildren(
    ...(first ? [el("option", { value: "" }, first)] : []),
    ...options.map((o) =>
      el("option", { value: o.value ?? o.id ?? o.code }, o.label ?? o.name),
    ),
  );
  if ([...select.options].some((o) => o.value === value)) select.value = value;
}
export function message(form, text, success = false) {
  const n = form.querySelector(success ? ".form-success" : ".form-error");
  if (n) {
    n.textContent = text;
    n.hidden = !text;
  }
}
export function busy(button, value, label = "Saving…") {
  if (value) {
    button.dataset.previous = button.textContent;
    button.textContent = label;
    button.disabled = true;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.previous || "Save";
  }
}
export function emptyState(title, description) {
  return el(
    "div",
    { class: "empty-state" },
    el("h3", {}, title),
    el("p", {}, description),
  );
}
export function downloadText(text, filename, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
