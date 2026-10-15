// TASK-031: SCREEN-016 / COMP-045. One response for E-003 and E-004 (D3 SCREEN-016),
// role-aware home link, focus target on the heading. The root not-found reads the viewer
// through the real principal resolver; next/headers and next/navigation are mocked.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { errorEnvelope } from "@/contracts";
import type { Locale } from "@/locales";
import type { NotFoundView } from "@/lib/not-found";

let cookieHeader: string | null = null;
let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => new Headers(cookieHeader ? { cookie: cookieHeader } : {}),
  cookies: async () => ({ get: (name: string) => (name === "fera-lang" && localeCookie ? { value: localeCookie } : undefined) }),
}));
// The real unstable_rethrow, so the not-found page is checked against Next's own
// control-flow errors; redirect/notFound are simplified for requireRole.
const navigation = await vi.importActual<typeof import("next/navigation")>("next/navigation");
vi.mock("next/navigation", async () => ({
  unstable_rethrow: (await vi.importActual<typeof import("next/navigation")>("next/navigation")).unstable_rethrow,
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const { NotFoundScreen } = await import("@/app/components/not-found-screen");
const { default: NotFound, generateMetadata } = await import("@/app/not-found");
const { setPoolForTests } = await import("@/server/db/pool");
const { NOT_FOUND_ERROR_IDS, notFoundView, showsNotFoundScreen } = await import("@/lib/not-found");
const { requireRole } = await import("@/server/auth/require-role");
const { signSessionToken } = await import("@/server/auth/tokens");
const { subkey, loadSecret } = await import("@/server/auth/secrets");
const { defaultAuthStore } = await import("@/server/auth/default");

const HASH = "$argon2id$v=19$m=19456,t=2,p=1$c3ludGhldGljc2FsdDAwMQ$c3ludGhldGljLWhhc2gtbm90LXJlYWwtMDAwMDAwMDAwMDAw";
const ids = {
  staff: "6b1f3c2a-4d5e-4f60-8a71-0000000000d1",
  officer: "6b1f3c2a-4d5e-4f60-8a71-0000000000d2",
  pending: "6b1f3c2a-4d5e-4f60-8a71-0000000000d3",
  admin: "6b1f3c2a-4d5e-4f60-8a71-0000000000d4",
};
type Row = { id: string; role: "staff" | "officer" | "admin"; verified: boolean; is_active: boolean; display_name: string; password_hash: string };
const row = (id: string, role: Row["role"], verified = false): Row => ({ id, role, verified, is_active: true, display_name: "[MOCK] ডেস্ক", password_hash: HASH });
const users: Record<string, Row> = {
  [ids.staff]: row(ids.staff, "staff"),
  [ids.officer]: row(ids.officer, "officer", true),
  [ids.pending]: row(ids.pending, "officer", false),
  [ids.admin]: row(ids.admin, "admin"),
};
const sessionFor = (id: string) => `fera_session=${signSessionToken(subkey(loadSecret("AUTH_SECRET"), "user-session.v1"), id, HASH, Date.now()).token}`;
const store = defaultAuthStore();

const screen = (locale: "bn" | "en", role: Parameters<typeof notFoundView>[0]) =>
  renderToStaticMarkup(createElement(NotFoundScreen, { locale, view: notFoundView(role) }));
const rootNotFound = async () => renderToStaticMarkup(await NotFound());

afterEach(() => setPoolForTests(null));

beforeEach(() => {
  cookieHeader = null;
  localeCookie = undefined;
  vi.restoreAllMocks();
  vi.spyOn(store, "userById").mockImplementation(async (id: string) => users[id] ?? null);
});

describe("SCREEN-016 copy and structure", () => {
  it("uses the D3 copy, which is also the E-004 catalogue message", () => {
    const bn = screen("bn", null);
    const en = screen("en", null);
    expect(bn).toContain("তথ্যটি পাওয়া যায়নি।");
    expect(en).toContain("We couldn&#x27;t find that.");
    expect(errorEnvelope("E-004").error.message_bn).toBe("তথ্যটি পাওয়া যায়নি।");
  });

  it("is one sentence and one action (D4 COMP-045): no extra paragraph", () => {
    const html = screen("en", null);
    expect(html).not.toMatch(/<p[ >]/);
    expect(html).toMatch(/<h1[^>]*font-semibold[^>]*\[&amp;:lang\(en\)\]:font-bold/); // Bangla headings semibold
  });

  it("names the page in the tab title, in the current language (SC 2.4.2)", async () => {
    expect(await generateMetadata()).toEqual({ title: "তথ্যটি পাওয়া যায়নি।" });
    localeCookie = "en";
    expect(await generateMetadata()).toEqual({ title: "We couldn't find that." });
  });

  it("keeps the home link's hover on the pressed action token (>= 4.5:1), not opacity", () => {
    const link = screen("en", "staff").match(/<a [^>]*>/)?.[0] ?? "";
    expect(link).toContain("hover:bg-primary-pressed");
    expect(link).not.toContain("opacity");
  });

  it("is a single h1 with tabindex -1 (focus moves to it), plus one home link", () => {
    const html = screen("en", "officer");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*tabindex="-1"/i);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*href="\/officer"[^>]*min-h-11/);
    expect(html).toContain("Back to home");
  });

  it("uses no red: neutral tones on both surfaces", () => {
    for (const html of [screen("bn", null), screen("bn", "staff")]) expect(html).not.toMatch(/danger|signal/);
  });
});

describe("E-003 and E-004 give one identical response", () => {
  it("both IDs, and only those, route a desk screen to SCREEN-016", () => {
    expect(NOT_FOUND_ERROR_IDS).toEqual(["E-003", "E-004"]);
    expect(NOT_FOUND_ERROR_IDS.every(showsNotFoundScreen)).toBe(true);
    for (const id of ["E-001", "E-002", "E-005", "E-007", "E-021", "e-004", ""]) expect(showsNotFoundScreen(id)).toBe(false);
  });

  it("structural guarantee: the screen's only inputs are locale and viewer, never an error ID or record", () => {
    expectTypeOf<Parameters<typeof NotFoundScreen>[0]>().toEqualTypeOf<{ locale: Locale; view: NotFoundView }>();
    expectTypeOf<NotFoundView>().toEqualTypeOf<{ surface: "desk" | "parent"; home: string }>();
    expect(NotFound.length).toBe(0); // the App Router not-found receives no props
    expect(notFoundView.length).toBe(1); // role only
  });

  it("so both IDs render the same markup per viewer, although their API envelopes differ", () => {
    expect(errorEnvelope("E-003").error.message_en).not.toBe(errorEnvelope("E-004").error.message_en);
    for (const locale of ["bn", "en"] as const) {
      for (const role of [null, "parent", "staff", "officer", "admin"] as const) {
        const [forbidden, missing] = NOT_FOUND_ERROR_IDS.map((id) => (showsNotFoundScreen(id) ? screen(locale, role) : ""));
        expect(forbidden).toBe(missing);
        expect(forbidden).not.toMatch(/E-00[34]|permission|অনুমতি/);
      }
    }
  });

  it("with TASK-015's default audit writer, a wrong-role visit writes access.denied and shows S-016, not a 500", async () => {
    const inserts: unknown[][] = [];
    setPoolForTests({
      async query(text: string, values: unknown[] = []) {
        if (text.startsWith("INSERT INTO audit_log")) inserts.push(values);
        return { rows: [{ id: "1" }] };
      },
    } as unknown as Pool);
    cookieHeader = sessionFor(ids.pending);
    await expect(requireRole(["officer"], "/officer/case/abc")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].slice(3, 7)).toEqual(["access.denied", null, null, '{"error_id":"E-004"}']);
    const html = await rootNotFound();
    expect(html).toContain('data-surface="desk"');
    expect(html).toContain('href="/staff"');
  });

  it("the page guard's wrong-role denial lands on the same not-found as a missing page", async () => {
    cookieHeader = sessionFor(ids.staff);
    const audit = vi.fn(async () => undefined);
    await expect(requireRole(["officer"], "/officer/case/abc", { auditDenied: audit })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(audit).toHaveBeenCalledTimes(1);
    // Next renders src/app/not-found.tsx for that throw and for an unknown URL alike.
    const afterDenial = await rootNotFound();
    expect(afterDenial).toBe(await rootNotFound());
    expect(afterDenial).toBe(screen("bn", "staff"));
  });
});

describe("root not-found: the viewer picks surface and home, nothing else", () => {
  it.each([
    ["signed out", null, "parent", "/"],
    ["staff", ids.staff, "desk", "/staff"],
    ["verified officer", ids.officer, "desk", "/officer"],
    ["unverified officer (BR-024)", ids.pending, "desk", "/staff"],
    ["admin", ids.admin, "desk", "/admin"],
  ])("%s", async (_, id, surface, home) => {
    cookieHeader = id ? sessionFor(id) : null;
    const html = await rootNotFound();
    expect(html).toContain(`data-surface="${surface}"`);
    expect(html).toContain(`href="${home}"`);
  });

  it("an invalid session cookie is treated as signed out", async () => {
    cookieHeader = "fera_session=garbage";
    expect(await rootNotFound()).toContain('data-surface="parent"');
  });

  it("a failed session lookup falls back to the signed-out view and logs the event only", async () => {
    cookieHeader = sessionFor(ids.staff);
    vi.spyOn(store, "userById").mockRejectedValue(Object.assign(new Error("connect timeout to 127.0.0.1"), { code: "ETIMEDOUT" }));
    const lines: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    });
    const html = await rootNotFound();
    expect(html).toContain('data-surface="parent"');
    expect(html).toContain('href="/"');
    const logged = lines.filter((l) => l.includes("page.viewer_lookup_failed"));
    expect(logged).toHaveLength(1);
    const entry = JSON.parse(logged[0]);
    expect(entry).toMatchObject({ level: 40, event: "page.viewer_lookup_failed", err_name: "Error", err_code: "ETIMEDOUT" });
    expect(logged[0]).not.toMatch(/fera_session|127\.0\.0\.1|officer|staff|timeout to/);
  });

  it("rethrows Next's own control-flow errors instead of swallowing them", async () => {
    let control: unknown;
    try {
      navigation.redirect("/elsewhere");
    } catch (err) {
      control = err;
    }
    expect(control).toBeInstanceOf(Error);
    cookieHeader = sessionFor(ids.staff);
    vi.spyOn(store, "userById").mockRejectedValue(control);
    await expect(NotFound()).rejects.toBe(control);
  });

  it("follows the language cookie", async () => {
    localeCookie = "en";
    expect(await rootNotFound()).toContain("We couldn&#x27;t find that.");
  });
});
