// Small hook/event harness for Node unit tests. No DOM or scheduler emulation:
// lifecycle/resource guarantees are tested here; real focus/reflow use Chrome.
import type { DependencyList, EffectCallback, ReactElement, ReactNode } from "react";

type Slot = { value?: unknown; deps?: DependencyList; cleanup?: () => void; setup?: EffectCallback };
let active: HookHarness | null = null;

function context(): HookHarness | null {
  // When the real React renderer (renderToStaticMarkup) is in control, the harness
  // is not active. The hooks below fall back to stable, predictable values so a
  // component rendered outside a harness call still produces a deterministic tree.
  return active;
}

class HookHarness {
  slots: Slot[] = [];
  cursor = 0;
  dirty = true;
  effects: (() => void)[] = [];
  tree: ReactNode;
  constructor(readonly component: () => ReactNode) {}
  slot() {
    const i = this.cursor++;
    return this.slots[i] ?? (this.slots[i] = {});
  }
  render() {
    do {
      this.dirty = false;
      this.cursor = 0;
      // eslint-disable-next-line @typescript-eslint/no-this-alias -- the active test render owns the hook slots
      active = this;
      try { this.tree = this.component(); } finally { active = null; }
      this.effects.splice(0).forEach((effect) => effect());
    } while (this.dirty);
    return this.tree;
  }
  unmount() {
    this.slots.forEach((slot) => slot.cleanup?.());
  }
  replayEffects() {
    this.slots.forEach((slot) => slot.cleanup?.());
    this.slots.forEach((slot) => { if (slot.setup) slot.cleanup = slot.setup() ?? undefined; });
    this.render();
  }
}

export const mountHooks = (component: () => ReactNode) => {
  const h = new HookHarness(component);
  h.render();
  return h;
};

const changed = (a?: DependencyList, b?: DependencyList) => !a || !b || a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));

export const testHooks = {
  useRef<T>(initial: T) {
    const h = context();
    if (!h) return { current: initial } as { current: T };
    const slot = h.slot();
    slot.value ??= { current: initial };
    return slot.value as { current: T };
  },
  useState<T>(initial: T | (() => T)) {
    const h = context();
    if (!h) return [typeof initial === "function" ? (initial as () => T)() : initial, () => {}] as const;
    const slot = h.slot();
    if (!("value" in slot)) slot.value = typeof initial === "function" ? (initial as () => T)() : initial;
    return [slot.value as T, (next: T | ((old: T) => T)) => {
      const value = typeof next === "function" ? (next as (old: T) => T)(slot.value as T) : next;
      if (!Object.is(value, slot.value)) { slot.value = value; h.dirty = true; }
    }] as const;
  },
  useReducer<S, A, I>(reducer: (s: S, a: A) => S, initial: S | I, init?: (arg: I) => S) {
    const [state, setState] = testHooks.useState(() => init ? init(initial as I) : initial as S);
    return [state, (event: A) => setState((old) => reducer(old, event))] as const;
  },
  useMemo<T>(fn: () => T, deps: DependencyList) {
    const h = context();
    if (!h) return fn();
    const slot = h.slot();
    if (changed(slot.deps, deps)) { slot.value = fn(); slot.deps = deps; }
    return slot.value as T;
  },
  useId() { return testHooks.useMemo(() => "test-id", []); },
  useEffect(fn: EffectCallback, deps?: DependencyList) {
    const h = context();
    if (!h) return;
    const slot = h.slot();
    if (changed(slot.deps, deps)) h.effects.push(() => {
      slot.cleanup?.();
      slot.cleanup = fn() ?? undefined;
      slot.setup = fn;
      slot.deps = deps;
    });
  },
};

export type Element = ReactElement<Record<string, unknown>>;
export function elements(tree: ReactNode): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const node = tree as Element;
  return [node, ...elements(node.props.children as ReactNode)];
}
export function content(tree: ReactNode): string {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  if (Array.isArray(tree)) return tree.map(content).join("");
  if (!tree || typeof tree !== "object" || !("props" in tree)) return "";
  return content((tree as Element).props.children as ReactNode);
}
export function button(tree: ReactNode, label: string): Element {
  const nodes = elements(tree);
  const found = nodes.find((node) => node.type === "button" && (
    content(node) === label || (typeof node.props["aria-labelledby"] === "string" && nodes.some((part) => part.props.id === node.props["aria-labelledby"] && content(part) === label))
  ));
  if (!found) throw new Error(`Button not found: ${label}`);
  return found;
}
export function click(node: Element) { (node.props.onClick as () => void)(); }
// Microtasks only (several callers use fake timers). 32 turns, not 8: Node 22's fetch
// Response.json() body read takes more turns than Node 24's, and CI runs Node 22.
export async function settle() { for (let i = 0; i < 32; i++) await Promise.resolve(); }
