// Desk layout (SCREEN-007/009/013, ACT-029). Sign-out control is now mounted in the
// (desk) route-group layout when a credential principal is present. Parents and signed-out
// visitors must not see the button: parents never reach a desk route, and unsigned visitors
// are redirected by the per-page requireRole guard. The layout itself never grants access.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

type Locale = "en" | "bn";
const localeCookie: { current: Locale } = { current: "en" };

let principal: unknown = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "fera-lang" && localeCookie.current ? { value: localeCookie.current } : undefined,
  }),
  headers: async () => ({ get: () => null }), // no session cookie
}));

vi.mock("@/server/auth/require-role", () => ({
  // Each test sets `principal` to drive the layout through one branch.
  currentPrincipal: async () => principal,
}));

const DeskLayout = (await import("@/app/(desk)/layout")).default;

afterEach(() => {
  localeCookie.current = "en";
  principal = null;
});

const render = async () =>
  renderToStaticMarkup(await DeskLayout({ children: createElement("main", null, "desk") }));

const user = (role: string, verified = false) => ({
  kind: "user",
  userId: "62414cac-a0d8-4b5d-b171-dab02a563081",
  role,
  verified,
  isActive: true,
});

describe("desk layout", () => {
  it("renders the Sign out button when an officer is signed in (en)", async () => {
    principal = user("officer", true);
    localeCookie.current = "en";
    const html = await render();
    expect(html).toContain("Sign out");
    expect(html).toContain("Officer");
    expect(html).toContain("<main>desk</main>");
  });

  it("renders the Bangla copy when the locale cookie is bn", async () => {
    principal = user("staff");
    localeCookie.current = "bn";
    const html = await render();
    expect(html).toContain("সাইন আউট");
    expect(html).toContain("স্টাফ");
  });

  it("renders the strip for an admin principal", async () => {
    principal = user("admin");
    localeCookie.current = "en";
    expect(await render()).toContain("Admin");
  });

  it("renders nothing signed-in-only when no principal is present (anonymous)", async () => {
    principal = null;
    expect(await render()).toBe("<main>desk</main>");
  });

  it("does not render the strip for a parent principal (parents have no desk session)", async () => {
    principal = { kind: "parent", sessionId: "11111111-1111-4111-8111-111111111111" };
    expect(await render()).toBe("<main>desk</main>");
  });
});