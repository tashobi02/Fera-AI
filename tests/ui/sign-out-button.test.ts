// TASK-031: ACT-029 sign-out control, markup only (server render in Node). Now mounted
// by src/app/(desk)/layout.tsx on signed-in staff/officer/admin pages.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignOutButton } from "@/app/components/sign-out-button";

const render = (locale: "bn" | "en") => renderToStaticMarkup(createElement(SignOutButton, { locale }));

describe("SignOutButton", () => {
  it("is one non-submitting 44 px button named with the D4 copy, icon decorative", () => {
    for (const [locale, label] of [["bn", "সাইন আউট"], ["en", "Sign out"]] as const) {
      const html = render(locale);
      const buttons = html.match(/<button[^>]*>/g) ?? [];
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toContain('type="button"');
      expect(buttons[0]).toContain("min-h-11");
      expect(buttons[0]).not.toMatch(/\saria-disabled="/); // idle
      expect(html).toContain(`<span>${label}</span>`);
      expect(html).toMatch(/<svg aria-hidden="true"/);
    }
  });

  it("has an always-mounted, empty alert region for the failure message", () => {
    expect(render("en")).toMatch(/<span role="alert"[^>]*><\/span>/);
  });
});
