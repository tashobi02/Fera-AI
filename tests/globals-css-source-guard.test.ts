// Source guard: reads src/app/globals.css as text and checks the Fera overrides
// that a rendered screen could otherwise break silently.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

function block(selectorPattern: RegExp): string {
  const match = css.match(new RegExp(`${selectorPattern.source}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`block not found: ${selectorPattern}`);
  return match[1];
}

const paper = block(/:root,\s*\[data-theme="light"\]/);
const cockpit = block(/:root:has\(\[data-surface="desk"\]\):not\(\[data-theme="light"\]\),\s*\[data-theme="dark"\]/);
const desk = block(/\[data-surface="desk"\],\s*\[data-surface="desk"\] \[data-theme\]/);

describe("globals.css source guard (DESIGN.md Fera overrides)", () => {
  it("defines no red outside a desk surface", () => {
    const outsideDesk = css.replace(desk, "");
    expect(outsideDesk).not.toMatch(/--danger(-soft|-text)?:/);
    expect(outsideDesk).not.toMatch(/--signal-(start|end):/);
    expect(desk).toMatch(/--danger: var\(--tone-danger\);/);
    expect(desk).toMatch(/--signal-start:/);
  });

  it("maps no utility straight to the private danger tones", () => {
    expect(css).not.toMatch(/--color-[\w-]+:\s*var\(--tone-/);
  });

  it("clears Tailwind's default palette so only design tokens exist", () => {
    expect(css).toMatch(/@theme inline\s*\{\s*--color-\*: initial;/);
  });

  it("defaults to Paper and switches to Cockpit only for desk surfaces", () => {
    expect(paper).toMatch(/color-scheme: light;/);
    expect(cockpit).toMatch(/color-scheme: dark;/);
  });

  it("applies ss03 to English runs only", () => {
    const en = css.match(/\[lang\|="en"\] \{\s*font-family[^}]*\}/)?.[0] ?? "";
    expect(en).toContain('"ss03"');
    const body = css.match(/\n {2}body \{[^}]*\}/)?.[0] ?? "";
    expect(body).not.toBe("");
    expect(body).not.toContain("ss03");
  });

  it("opens Bangla line heights for headings and small text", () => {
    const bn = block(/\n\[lang\|="bn"\]/);
    for (const heading of ["heading-1", "heading-2", "heading-3"]) {
      expect(bn).toContain(`--lh-${heading}: 1.45;`);
    }
    for (const small of ["caption-sm", "caption-md", "body-sm"]) {
      const value = Number(bn.match(new RegExp(`--lh-${small}: ([\\d.]+);`))?.[1]);
      expect(value).toBeGreaterThanOrEqual(1.6);
    }
  });

  it("does not load fonts from a CDN", () => {
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic|@import url\(/);
  });
});
