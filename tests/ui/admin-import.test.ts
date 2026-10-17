// SCREEN-013 / COMP-043 import panel copy and reserved source URL assignment.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { syntheticImportSourceUrl } from "@/lib/admin-import";
import { ImportForm } from "@/app/(desk)/admin/import-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

describe("SCREEN-013 synthetic import form", () => {
  it("renders bilingual synthetic-only and no-live-extraction copy", () => {
    const bn = renderToStaticMarkup(createElement(ImportForm, { locale: "bn" }));
    const en = renderToStaticMarkup(createElement(ImportForm, { locale: "en" }));

    expect(bn).toContain("সিনথেটিক টেক্সট ইমপোর্ট");
    expect(bn).toContain("লাইভ এআই এক্সট্রাকশন চলে না");
    expect(en).toContain("Import synthetic texts");
    expect(en).toContain("Demo imports use deterministic simulation; live AI extraction does not run.");
    expect(en).toContain("Source URLs are never fetched.");
    expect(en).toContain("name=\"synthetic_confirmation\"");
    expect(en).toContain('type="url"');
    expect(en).not.toContain("AI adapter");
  });

  it("assigns distinct reserved URLs when no shared URL is entered", () => {
    expect(syntheticImportSourceUrl("", 0)).toBe("https://example.invalid/fixture/line-1");
    expect(syntheticImportSourceUrl("  ", 1)).toBe("https://example.invalid/fixture/line-2");
    expect(syntheticImportSourceUrl("https://fixture.example.invalid/source/7", 3)).toBe(
      "https://fixture.example.invalid/source/7",
    );
  });
});
