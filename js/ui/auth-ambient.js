import { createAmbientRenderer } from "./ambient-renderer.js";

/** Optional visual enhancement. Authentication has no dependency on this module. */
export function mountAmbient(root, rendererFactory = createAmbientRenderer) {
  if (!root) return () => {};
  const canvas = root.querySelector(".ambient-canvas"),
    button = root.querySelector("[data-motion-toggle]"),
    view = root.ownerDocument.defaultView,
    doc = root.ownerDocument;
  if (!canvas || !button || !view.requestAnimationFrame) return () => {};
  const preference = view.matchMedia("(prefers-reduced-motion: reduce)"),
    connection = view.navigator.connection;
  let paused = false,
    renderer = null,
    frame = 0,
    previous = 0,
    elapsed = 0,
    onScreen = true,
    destroyed = false,
    unavailable = false;
  let target = [0, 0],
    pointer = [0, 0];
  const cleanup = [];
  try {
    paused = view.localStorage.getItem("expenseTracker:motion") === "paused";
  } catch {}
  const on = (node, event, handler, options) => {
    node?.addEventListener?.(event, handler, options);
    cleanup.push(() => node?.removeEventListener?.(event, handler, options));
  };
  function stop() {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  }
  function discard() {
    stop();
    renderer?.destroy();
    renderer = null;
    root.dataset.ambientState = "static";
  }
  function draw() {
    renderer?.draw(elapsed / 1000, pointer[0], pointer[1]);
  }
  function tick(now) {
    frame = 0;
    if (destroyed || paused || !onScreen || doc.hidden || !renderer) return;
    if (!previous || now - previous >= 1000 / 30) {
      elapsed += previous ? Math.min(now - previous, 100) : 0;
      previous = now;
      pointer = pointer.map((value, i) => value + (target[i] - value) * 0.08);
      try {
        draw();
      } catch {
        unavailable = true;
        discard();
        button.hidden = true;
        return;
      }
    }
    frame = view.requestAnimationFrame(tick);
  }
  function resize() {
    if (!renderer) return;
    const rect = root.getBoundingClientRect();
    renderer.resize(rect.width, rect.height, view.devicePixelRatio || 1);
    draw();
  }
  function reconcile() {
    if (destroyed) return;
    if (preference.matches || connection?.saveData || unavailable) {
      discard();
      button.hidden = true;
      return;
    }
    if (!renderer && onScreen && !doc.hidden) {
      try {
        renderer = rendererFactory(canvas);
        if (!renderer) throw new Error("Graphics unavailable");
        resize();
        root.dataset.ambientState = "ready";
      } catch {
        unavailable = true;
        discard();
        button.hidden = true;
        return;
      }
    }
    button.hidden = !renderer;
    button.textContent = paused ? "Play motion" : "Pause motion";
    button.setAttribute(
      "aria-label",
      paused ? "Play background animation" : "Pause background animation",
    );
    if (!renderer || paused || !onScreen || doc.hidden) stop();
    else if (!frame) frame = view.requestAnimationFrame(tick);
  }
  on(button, "click", () => {
    paused = !paused;
    try {
      view.localStorage.setItem(
        "expenseTracker:motion",
        paused ? "paused" : "playing",
      );
    } catch {}
    reconcile();
  });
  on(
    root,
    "pointermove",
    (event) => {
      if (event.pointerType === "touch" || paused || !renderer) return;
      const rect = root.getBoundingClientRect();
      target = [
        (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5,
        0.5 - (event.clientY - rect.top) / Math.max(1, rect.height),
      ];
    },
    { passive: true },
  );
  on(root, "pointerleave", () => {
    target = [0, 0];
  });
  on(doc, "visibilitychange", reconcile);
  on(preference, "change", reconcile);
  on(connection, "change", reconcile);
  on(
    view,
    "resize",
    () => {
      try {
        resize();
      } catch {
        unavailable = true;
        reconcile();
      }
    },
    { passive: true },
  );
  on(canvas, "webglcontextlost", (event) => {
    event.preventDefault();
    discard();
    button.hidden = true;
    unavailable = true;
  });
  on(canvas, "webglcontextrestored", () => {
    unavailable = false;
    reconcile();
  });
  if (view.IntersectionObserver) {
    const observer = new view.IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      reconcile();
    });
    observer.observe(root);
    cleanup.push(() => observer.disconnect());
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    discard();
    button.hidden = true;
    for (const off of cleanup) off();
  }
  // A bfcache restoration keeps its listeners and resumes only when visible.
  on(view, "pagehide", (event) => (event.persisted ? discard() : destroy()));
  on(view, "pageshow", reconcile);
  reconcile();
  return destroy;
}

if (typeof document !== "undefined") {
  try {
    mountAmbient(document.querySelector("[data-ambient]"));
  } catch {
    // The static CSS backdrop stays visible; account access stays independent.
  }
}
