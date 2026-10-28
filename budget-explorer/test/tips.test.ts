import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { infoTip } from "../src/format";
import { CLIENT_JS } from "../src/style";

const HARNESS = `
const listeners = { document: Object.create(null), window: Object.create(null) };
function listen(bucket, type, fn) {
  if (!bucket[type]) bucket[type] = [];
  bucket[type].push(fn);
}
function matches(el, selector) {
  if (!(el instanceof Element)) return false;
  let rest = selector.trim();
  if (rest.startsWith("#")) {
    const name = rest.slice(1).split(/[#.\\[]/)[0];
    if (el.id !== name) return false;
    rest = rest.slice(1 + name.length);
  } else if (rest.startsWith(".")) {
    const name = rest.slice(1).split(/[#.\\[]/)[0];
    if (!el.className.split(/\\s+/).includes(name)) return false;
    rest = rest.slice(1 + name.length);
  } else if (/^[A-Za-z]/.test(rest)) {
    const name = rest.split(/[#.\\[]/)[0];
    if (el.tagName !== name.toUpperCase()) return false;
    rest = rest.slice(name.length);
  }
  while (rest.startsWith("[")) {
    const end = rest.indexOf("]");
    const body = rest.slice(1, end);
    rest = rest.slice(end + 1);
    const eq = body.match(/^([^=]+)=['"](.*)['"]$/);
    if (eq) {
      if (el.getAttribute(eq[1]) !== eq[2]) return false;
    } else if (el.getAttribute(body) == null) return false;
  }
  return rest === "";
}
function allElements(root) {
  const out = [];
  const stack = [...(root.childNodes || [])];
  while (stack.length) {
    const node = stack.shift();
    if (node instanceof Element) out.push(node);
    if (node && node.childNodes) stack.push(...node.childNodes);
  }
  return out;
}
class Node {
  constructor() {
    this.childNodes = [];
    this.parentNode = null;
  }
  contains(node) {
    if (node === this) return true;
    let parent = node ? node.parentNode : null;
    while (parent) {
      if (parent === this) return true;
      parent = parent.parentNode;
    }
    return false;
  }
}
class Element extends Node {
  constructor(tag) {
    super();
    this.tagName = String(tag || "div").toUpperCase();
    this.attrs = Object.create(null);
    this.style = {};
    this.className = "";
    this.id = "";
    this.hidden = false;
    this.rect = null;
    this.naturalHeight = 0;
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
    if (name === "id") this.id = String(value);
  }
  getAttribute(name) {
    if (name === "id") return this.id || null;
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }
  appendChild(child) {
    if (child.parentNode) {
      const list = child.parentNode.childNodes;
      const index = list.indexOf(child);
      if (index >= 0) list.splice(index, 1);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  closest(selector) {
    let node = this;
    while (node) {
      if (node instanceof Element && matches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }
  querySelector(selector) {
    return allElements(this).find((el) => matches(el, selector)) || null;
  }
  querySelectorAll(selector) {
    return allElements(this).filter((el) => matches(el, selector));
  }
  getBoundingClientRect() {
    const width = this.style.width ? parseFloat(this.style.width) : this.rect ? this.rect.width : 0;
    const height = this.style.maxHeight ? parseFloat(this.style.maxHeight) : this.naturalHeight || (this.rect ? this.rect.height : 0);
    const left = this.style.left ? parseFloat(this.style.left) : this.rect ? this.rect.left : 0;
    const top = this.style.top ? parseFloat(this.style.top) : this.rect ? this.rect.top : 0;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }
  focus() {
    document.activeElement = this;
  }
}
class HTMLElement extends Element {}
class HTMLButtonElement extends HTMLElement {}
class HTMLSelectElement extends HTMLElement {}
class HTMLAnchorElement extends HTMLElement {}
const document = {
  childNodes: [],
  activeElement: null,
  addEventListener(type, fn) { listen(listeners.document, type, fn); },
  querySelector(selector) { return allElements(document).find((el) => matches(el, selector)) || null; },
  querySelectorAll(selector) { return allElements(document).filter((el) => matches(el, selector)); },
  getElementById(id) { return allElements(document).find((el) => el.id === id) || null; },
};
const window = {
  innerWidth: 800,
  innerHeight: 600,
  addEventListener(type, fn) { listen(listeners.window, type, fn); },
};
const body = new HTMLElement("body");
body.parentNode = document;
document.body = body;
document.childNodes.push(body);
function makeTip(id, rect) {
  const wrap = new HTMLElement("span");
  wrap.className = "tip";
  const button = new HTMLButtonElement("button");
  button.className = "tip-btn";
  button.setAttribute("type", "button");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-describedby", "tip-" + id);
  button.setAttribute("aria-controls", "tip-" + id);
  button.rect = rect;
  const pop = new HTMLElement("span");
  pop.className = "tip-pop";
  pop.id = "tip-" + id;
  pop.hidden = true;
  pop.naturalHeight = 48;
  wrap.appendChild(button);
  wrap.appendChild(pop);
  body.appendChild(wrap);
  return { button, pop, wrap };
}
const tips = [
  makeTip("a", { left: 20, top: 20, width: 20, height: 20, right: 40, bottom: 40 }),
  makeTip("b", { left: 80, top: 20, width: 20, height: 20, right: 100, bottom: 40 }),
];
const outside = new HTMLElement("p");
body.appendChild(outside);
${CLIENT_JS}
function fire(type, init) {
  const event = {
    type,
    target: init && init.target !== undefined ? init.target : body,
    relatedTarget: init && init.relatedTarget !== undefined ? init.relatedTarget : null,
    pointerType: init && init.pointerType ? init.pointerType : "mouse",
    key: init && init.key ? init.key : "",
    preventDefault() {},
    stopPropagation() {},
  };
  for (const fn of listeners.document[type] || []) fn(event);
  return event;
}
function scroll() {
  const event = { type: "scroll", target: document };
  for (const fn of listeners.window.scroll || []) fn(event);
  for (const fn of listeners.document.scroll || []) fn(event);
}
globalThis.__tips = { tips, outside, document, window, fire, scroll };
`;

type TipBox = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

type TipNode = {
  className: string;
  id: string;
  hidden: boolean;
  parentNode: TipNode | null;
  style: Record<string, string>;
  rect: TipBox | null;
  naturalHeight: number;
  getAttribute(name: string): string | null;
  focus(): void;
};

type TipPair = { button: TipNode; pop: TipNode; wrap: TipNode };

type TipWorld = {
  tips: TipPair[];
  outside: TipNode;
  document: { activeElement: TipNode | null; body: TipNode };
  window: { innerWidth: number; innerHeight: number };
  fire(type: string, init?: { target?: TipNode | null; relatedTarget?: TipNode | null; pointerType?: string; key?: string }): void;
  scroll(): void;
};

function boot(): TipWorld {
  const context = vm.createContext({ console });
  vm.runInContext(HARNESS, context, { filename: "tips-harness.js" });
  return (context as { __tips: TipWorld }).__tips;
}

function openCount(world: TipWorld): number {
  return world.tips.filter((tip) => tip.button.getAttribute("aria-expanded") === "true" && tip.pop.hidden === false).length;
}

describe("info tip markup", () => {
  it("renders one closed sentence on a described button", () => {
    const html = infoTip("Where Goes", "Spending against each fund's revised budget. The rest stays off the tip.");
    expect(html).toContain('aria-label="What is this?"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-describedby="tip-where-goes"');
    expect(html).toContain('aria-controls="tip-where-goes"');
    expect(html).toContain('id="tip-where-goes"');
    expect(html).toContain('role="tooltip"');
    expect(html).toContain("hidden");
    expect(html).toContain("Spending against each fund&#39;s revised budget.");
    expect(html).not.toContain("The rest stays off the tip.");
    expect(html).not.toContain('aria-expanded="true"');
    expect(html).not.toMatch(/\u2014|\u2013/);
    expect(infoTip("empty", "n/a")).toBe("");
  });
});

describe("info tip behavior", () => {
  it("starts closed and ignores focus", () => {
    const world = boot();
    expect(openCount(world)).toBe(0);
    world.tips[0].button.focus();
    world.fire("focusin", { target: world.tips[0].button });
    expect(world.document.activeElement).toBe(world.tips[0].button);
    expect(openCount(world)).toBe(0);
  });

  it("opens one tip on hover and closes it when the pointer leaves", () => {
    const world = boot();
    const [first, second] = world.tips;
    world.fire("pointerover", { target: first.button, pointerType: "mouse" });
    expect(first.button.getAttribute("aria-expanded")).toBe("true");
    expect(first.pop.hidden).toBe(false);
    expect(second.pop.hidden).toBe(true);
    expect(openCount(world)).toBe(1);
    world.fire("pointerover", { target: second.button, pointerType: "mouse" });
    expect(first.button.getAttribute("aria-expanded")).toBe("false");
    expect(first.pop.hidden).toBe(true);
    expect(second.button.getAttribute("aria-expanded")).toBe("true");
    expect(openCount(world)).toBe(1);
    world.fire("pointerout", { target: second.button, relatedTarget: null, pointerType: "mouse" });
    expect(openCount(world)).toBe(0);
  });

  it("does not leave a hover tip open when the button is focused", () => {
    const world = boot();
    const button = world.tips[0].button;
    world.fire("pointerover", { target: button, pointerType: "mouse" });
    button.focus();
    world.fire("pointerout", { target: button, relatedTarget: null, pointerType: "mouse" });
    expect(openCount(world)).toBe(0);
  });

  it("keeps the tip open while the pointer is on the popup and closes when it leaves", () => {
    const world = boot();
    const { button, pop } = world.tips[0];
    world.fire("pointerover", { target: button, pointerType: "mouse" });
    world.fire("pointerout", { target: button, relatedTarget: pop, pointerType: "mouse" });
    expect(pop.hidden).toBe(false);
    world.fire("pointerout", { target: pop, relatedTarget: null, pointerType: "mouse" });
    expect(openCount(world)).toBe(0);
  });

  it("pins on click, closes on a second click, outside click, Escape, or scroll", () => {
    const world = boot();
    const [first, second] = world.tips;
    world.fire("click", { target: first.button });
    expect(first.button.getAttribute("aria-expanded")).toBe("true");
    world.fire("pointerout", { target: first.button, relatedTarget: null, pointerType: "mouse" });
    expect(first.pop.hidden).toBe(false);
    world.fire("click", { target: first.pop });
    expect(openCount(world)).toBe(1);
    world.fire("click", { target: second.button });
    expect(first.pop.hidden).toBe(true);
    expect(second.button.getAttribute("aria-expanded")).toBe("true");
    expect(openCount(world)).toBe(1);
    world.fire("click", { target: second.button });
    expect(openCount(world)).toBe(0);

    world.fire("click", { target: first.button });
    world.fire("click", { target: world.outside });
    expect(openCount(world)).toBe(0);

    world.fire("click", { target: first.button });
    world.fire("keydown", { key: "Escape", target: world.document.body });
    expect(openCount(world)).toBe(0);
    expect(world.document.activeElement).toBe(first.button);

    world.fire("click", { target: first.button });
    world.scroll();
    expect(openCount(world)).toBe(0);
  });

  it("does not open from the touch hover that follows a tap", () => {
    const world = boot();
    const button = world.tips[0].button;
    world.fire("pointerdown", { target: button, pointerType: "touch" });
    world.fire("pointerover", { target: button, pointerType: "mouse" });
    expect(openCount(world)).toBe(0);
    world.fire("click", { target: button });
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("places the popup inside the viewport, above the page, on the body", () => {
    const world = boot();
    world.window.innerWidth = 400;
    world.window.innerHeight = 120;
    const { button, pop } = world.tips[0];
    button.rect = { left: 380, top: 100, width: 20, height: 20, right: 400, bottom: 120 };
    pop.naturalHeight = 200;
    world.fire("pointerover", { target: button, pointerType: "mouse" });
    const left = parseFloat(pop.style.left);
    const top = parseFloat(pop.style.top);
    const width = parseFloat(pop.style.width);
    const height = parseFloat(pop.style.maxHeight);
    expect(pop.hidden).toBe(false);
    expect(pop.parentNode).toBe(world.document.body);
    expect(pop.style.position).toBe("fixed");
    expect(pop.style.zIndex).toBe("80");
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + width).toBeLessThanOrEqual(world.window.innerWidth - 8);
    expect(top).toBeGreaterThanOrEqual(8);
    expect(top + height).toBeLessThanOrEqual(world.window.innerHeight - 8);
    expect(world.tips[1].pop.hidden).toBe(true);
  });
});
