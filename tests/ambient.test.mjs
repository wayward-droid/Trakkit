import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const { JSDOM } = await import(
  process.env.EXPENSE_QA_MODULES
    ? pathToFileURL(process.env.EXPENSE_QA_MODULES + "/jsdom/lib/api.js").href
    : "jsdom"
);
const root = existsSync(new URL("../dist/index.html", import.meta.url))
  ? new URL("../dist/", import.meta.url)
  : new URL("../", import.meta.url);
const { mountAmbient } = await import(new URL("js/ui/auth-ambient.js", root));
const { createAmbientRenderer } = await import(
  new URL("js/ui/ambient-renderer.js", root)
);

function scene() {
  const dom = new JSDOM(
    '<section data-ambient><canvas class="ambient-canvas"></canvas><button data-motion-toggle hidden>Pause motion</button></section>',
    { url: "https://example.test" },
  );
  const view = dom.window,
    document = view.document;
  const element = document.querySelector("section"),
    button = document.querySelector("button");
  const media = new view.EventTarget(),
    connection = new view.EventTarget();
  media.matches = false;
  connection.saveData = false;
  view.matchMedia = () => media;
  Object.defineProperty(view.navigator, "connection", { value: connection });
  let hidden = false,
    number = 0,
    intersection;
  Object.defineProperty(document, "hidden", { get: () => hidden });
  element.getBoundingClientRect = () => ({
    width: 800,
    height: 900,
    left: 0,
    top: 0,
  });
  const frames = new Map(),
    calls = [];
  view.requestAnimationFrame = (fn) => {
    frames.set(++number, fn);
    return number;
  };
  view.cancelAnimationFrame = (id) => frames.delete(id);
  view.IntersectionObserver = class {
    constructor(fn) {
      intersection = fn;
    }
    observe() {}
    disconnect() {
      calls.push("disconnect");
    }
  };
  const factory = () => {
    calls.push("create");
    return {
      resize() {
        calls.push("resize");
      },
      draw() {
        calls.push("draw");
      },
      destroy() {
        calls.push("destroy");
      },
    };
  };
  return {
    dom,
    view,
    element,
    button,
    media,
    connection,
    frames,
    calls,
    factory,
    hidden(value) {
      hidden = value;
      document.dispatchEvent(new view.Event("visibilitychange"));
    },
    visible(value) {
      intersection([{ isIntersecting: value }]);
    },
    tick(time) {
      const [[id, fn]] = frames;
      frames.delete(id);
      fn(time);
    },
  };
}

test("Ambient motion caps frames, remembers pause, and stops when hidden or offscreen", () => {
  const s = scene(),
    destroy = mountAmbient(s.element, s.factory);
  try {
    assert.equal(s.element.dataset.ambientState, "ready");
    assert.equal(s.button.hidden, false);
    assert.equal(s.frames.size, 1);
    s.tick(100);
    const draws = s.calls.filter((v) => v === "draw").length;
    s.tick(110);
    assert.equal(s.calls.filter((v) => v === "draw").length, draws);
    s.button.click();
    assert.equal(s.frames.size, 0);
    assert.equal(
      s.view.localStorage.getItem("expenseTracker:motion"),
      "paused",
    );
    assert.equal(s.button.textContent, "Play motion");
    s.button.click();
    assert.equal(s.frames.size, 1);
    s.hidden(true);
    assert.equal(s.frames.size, 0);
    s.hidden(false);
    assert.equal(s.frames.size, 1);
    s.visible(false);
    assert.equal(s.frames.size, 0);
    s.visible(true);
    assert.equal(s.frames.size, 1);
    destroy();
    assert.equal(s.frames.size, 0);
    assert.equal(s.calls.filter((v) => v === "destroy").length, 1);
    assert.ok(s.calls.includes("disconnect"));
    s.button.click();
    assert.equal(s.frames.size, 0);
  } finally {
    destroy();
    s.dom.window.close();
  }
});

test("Reduced motion and data-saving preferences use the static background without rendering", () => {
  const s = scene();
  s.media.matches = true;
  const destroy = mountAmbient(s.element, s.factory);
  try {
    assert.equal(s.calls.length, 0);
    assert.equal(s.button.hidden, true);
    assert.equal(s.element.dataset.ambientState, "static");
    s.media.matches = false;
    s.media.dispatchEvent(new s.view.Event("change"));
    assert.equal(s.frames.size, 1);
    s.connection.saveData = true;
    s.connection.dispatchEvent(new s.view.Event("change"));
    assert.equal(s.frames.size, 0);
    assert.equal(s.calls.filter((v) => v === "destroy").length, 1);
    assert.equal(s.button.hidden, true);
  } finally {
    destroy();
    s.dom.window.close();
  }
});

test("Unavailable graphics fall back safely and cached navigation resumes a single renderer", () => {
  assert.equal(createAmbientRenderer({ getContext: () => null }), null);
  for (const factory of [
    () => null,
    () => {
      throw new Error("No graphics");
    },
  ]) {
    const s = scene(),
      destroy = mountAmbient(s.element, factory);
    assert.equal(s.element.dataset.ambientState, "static");
    assert.equal(s.frames.size, 0);
    assert.equal(s.button.hidden, true);
    destroy();
    s.dom.window.close();
  }
  const s = scene();
  s.view.localStorage.setItem("expenseTracker:motion", "paused");
  const destroy = mountAmbient(s.element, s.factory);
  try {
    assert.equal(s.frames.size, 0);
    assert.equal(s.button.textContent, "Play motion");
    s.button.click();
    s.view.dispatchEvent(
      new s.view.PageTransitionEvent("pagehide", { persisted: true }),
    );
    assert.equal(s.frames.size, 0);
    s.view.dispatchEvent(
      new s.view.PageTransitionEvent("pageshow", { persisted: true }),
    );
    assert.equal(s.frames.size, 1);
    assert.equal(s.calls.filter((v) => v === "create").length, 2);
  } finally {
    destroy();
    s.dom.window.close();
  }
});
