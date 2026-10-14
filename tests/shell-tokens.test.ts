import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("shell tokens (DESIGN.md Fera overrides)", () => {
  it("neutralises danger and the signal gradient on parent surfaces", () => {
    const rule = css.match(/\[data-surface="parent"\]\s*\{([^}]*)\}/)?.[1] ?? "";
    for (const token of ["--danger", "--danger-soft", "--danger-text", "--signal-start", "--signal-end"]) {
      expect(rule).toContain(`${token}: initial;`);
    }
  });

  it("clears Tailwind's default palette so only design tokens exist", () => {
    expect(css).toMatch(/@theme inline\s*\{\s*--color-\*: initial;/);
  });

  it("defaults to Paper and switches to Cockpit only for desk surfaces", () => {
    expect(css).toMatch(/:root,\s*\[data-theme="light"\]\s*\{\s*color-scheme: light;/);
    expect(css).toMatch(/:root:has\(\[data-surface="desk"\]\):not\(\[data-theme="light"\]\),\s*\[data-theme="dark"\]\s*\{\s*color-scheme: dark;/);
  });

  it("does not load fonts from a CDN", () => {
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@import url\(/);
  });
});
