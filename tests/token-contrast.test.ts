// WCAG 2.x contrast for the token pairs the shell uses, computed from the values
// in src/app/globals.css (D4 §13: text >= 4.5:1, non-text >= 3:1).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Rgba = [number, number, number, number]; // sRGB 0–1, alpha 0–1

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function tokens(selectorPattern: RegExp): Record<string, string> {
  const body = css.match(new RegExp(`${selectorPattern.source}\\s*\\{([^}]*)\\}`))?.[1];
  if (!body) throw new Error(`block not found: ${selectorPattern}`);
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const encode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const decode = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp = (c: number) => Math.min(1, Math.max(0, c));

function parse(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((h) => h + h).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).concat(1) as Rgba;
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/)?.[1];
  if (rgba) {
    const [r, g, b, a = 1] = rgba.split(",").map(Number);
    return [r / 255, g / 255, b / 255, a];
  }
  const oklch = value.match(/^oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)$/);
  if (oklch) {
    const [L, C, h] = [Number(oklch[1]) / 100, Number(oklch[2]), (Number(oklch[3]) * Math.PI) / 180];
    const [a, b] = [C * Math.cos(h), C * Math.sin(h)];
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    return [...lin.map((c) => clamp(encode(c))), 1] as Rgba;
  }
  throw new Error(`unsupported colour: ${value}`);
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1) as Rgba;
}

const luminance = ([r, g, b]: Rgba) => 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b);

function contrast(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const themes = {
  Paper: tokens(/:root,\s*\[data-theme="light"\]/),
  Cockpit: tokens(/:root:has\(\[data-surface="desk"\]\):not\(\[data-theme="light"\]\),\s*\[data-theme="dark"\]/),
};

// [foreground, background, optional base under a translucent background]
const textPairs: [string, string, string?][] = [
  ["text-body", "bg-canvas"],
  ["text-body", "bg-surface"],
  ["text-strong", "bg-surface"],
  ["text-strong", "bg-canvas"],
  ["text-strong", "bg-segment-active"],
  ["text-muted", "bg-canvas"],
  ["text-muted", "bg-surface"],
  ["text-muted", "bg-elevated"],
  ["text-faint", "bg-canvas"],
  ["text-faint", "bg-surface"],
  ["text-faint", "bg-elevated"],
  ["link", "bg-canvas"],
  ["link", "bg-surface"],
  ["action-fg", "action-bg"],
  ["info-text", "info-soft", "bg-surface"],
  ["info-text", "info-soft", "bg-canvas"],
  ["success-text", "success-soft", "bg-surface"],
  ["warning-text", "warning-soft", "bg-surface"],
  ["tone-danger-text", "tone-danger-soft", "bg-surface"],
];

const nonTextPairs: [string, string][] = [
  ["focus-ring", "bg-canvas"],
  ["focus-ring", "bg-surface"],
  ["text-strong", "bg-segment-active"], // selected-language bar
];

describe.each(Object.entries(themes))("%s token contrast", (_name, t) => {
  const colour = (key: string) => {
    if (!t[key]) throw new Error(`missing token --${key}`);
    return parse(t[key]);
  };
  const resolve = (bg: string, base?: string) => (base ? over(colour(bg), colour(base)) : colour(bg));

  it.each(textPairs)("--%s on --%s is >= 4.5:1 (text)", (fg, bg, base) => {
    expect(contrast(colour(fg), resolve(bg, base))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(nonTextPairs)("--%s against --%s is >= 3:1 (non-text)", (fg, bg) => {
    expect(contrast(colour(fg), colour(bg))).toBeGreaterThanOrEqual(3);
  });
});

describe("contrast helper", () => {
  it("matches the WCAG reference values", () => {
    expect(contrast(parse("#000000"), parse("#ffffff"))).toBeCloseTo(21, 5);
    expect(contrast(parse("#777777"), parse("#ffffff"))).toBeCloseTo(4.48, 2);
  });
});
