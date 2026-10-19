import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/locale", () => ({ setLocale: "/locale" }));
const { LanguageToggle } = await import("@/app/components/language-toggle");

describe("LanguageToggle accessible names", () => {
  it("names the destination language and marks the current language in both locales", () => {
    const english = renderToStaticMarkup(createElement(LanguageToggle, { locale: "en" }));
    expect(english).toContain('aria-label="Switch language to English (current)"');
    expect(english).toContain('aria-label="Switch language to বাংলা"');

    const bangla = renderToStaticMarkup(createElement(LanguageToggle, { locale: "bn" }));
    expect(bangla).toContain('aria-label="ভাষা বদলান: বাংলা (বর্তমান ভাষা)"');
    expect(bangla).toContain('aria-label="ভাষা বদলান: English"');
  });
});
