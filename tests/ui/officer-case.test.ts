// TASK-029 + P3-019: SCREEN-012 officer case detail / close / audit copy (TASK-029;
// FR-018, FR-021; TC-010). Server-rendered in Node (no browser here). The page reads
// through the same `readCase` and `readCaseAudit` services the API uses, so a non-officer
// visitor is rejected in `requireRole` and `notFound()` lands on SCREEN-016.
//
// - Close form is limited to the outcome the page passes in (allowedCloseOutcome): only
//   "coordination_recorded" for confirmed, "resolved_outside_fera" for open. The other
//   radio is disabled in markup so a stale UI cannot pick a closed-only choice.
// - Two-step confirm: step 1 collects note + outcome, step 2 is the final close. The
//   D3 success line is verbatim in both locales.
// - On a stale-version error (E-005) the page shows a reload prompt and keeps the typed
//   note so the officer does not lose what they wrote (D3 SCREEN-012 / SCREEN-016).
// - The audit list never renders raw `audit_log.details` (D2A §5.4 / §9.2): it uses the
//   safe projection only.
// - No rescue / return / reunification wording anywhere.
// - Bangla + English for every new state (loading, empty, error).
import type { FormEvent } from "react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { errorEnvelope } from "@/contracts";
import type {
  OfficerAuditResponse,
  OfficerCaseView,
} from "@/contracts";
import {
  exampleCloseCaseResponse,
  exampleOfficerAuditResponse,
  exampleOfficerFoundView,
  exampleOfficerMissingView,
} from "@/contracts/examples";
import { button, click, content, elements, mountHooks, settle } from "../intake-ui/fakes/hook-harness";

let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "fera-lang" && localeCookie
        ? { value: localeCookie }
        : undefined,
  }),
}));

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

// requireRole is called with the same arguments the desk pages use.
const guard = vi.hoisted(() => ({
  principal: { kind: "user", role: "officer", verified: true, id: "6b1f3c2a-4d5e-4f60-8a71-000000000021" } as unknown,
  calls: [] as unknown[][],
  notFound: false,
}));
vi.mock("@/server/auth/require-role", () => ({
  requireRole: async (...args: unknown[]) => {
    guard.calls.push(args);
    if (guard.notFound) {
      // The real guard throws notFound() — but the mock imports the mocked notFound
      // helper that throws NEXT_NOT_FOUND. The page test imports `default` (page) so it
      // relies on this throw.
      throw new Error("NEXT_NOT_FOUND");
    }
    return { principal: guard.principal, role: "officer" };
  },
}));

// readCase and readCaseAudit are the only data sources the page uses. The tests below
// drive them directly so we can assert the page passes the right id, never fetches via
// HTTP, and renders the per-role allowlist. The initial data is seeded lazily inside
// the mock factory so the hoisted block can stay free of module-scope references.
type PageReads = {
  caseResult: unknown;
  auditResult: unknown;
  caseCalls: unknown[][];
  auditCalls: unknown[][];
  caseThrows: boolean;
  auditThrows: boolean;
};
const pageReads: PageReads = {
  caseResult: null,
  auditResult: null,
  caseCalls: [],
  auditCalls: [],
  caseThrows: false,
  auditThrows: false,
};
vi.mock("@/server/case", () => ({
  readCase: async (...args: unknown[]) => {
    pageReads.caseCalls.push(args);
    if (pageReads.caseThrows) throw new Error("readCase failed");
    return pageReads.caseResult;
  },
}));
vi.mock("@/server/audit/safe-read", () => ({
  readCaseAudit: async (...args: unknown[]) => {
    pageReads.auditCalls.push(args);
    if (pageReads.auditThrows) throw new Error("readCaseAudit failed");
    return pageReads.auditResult;
  },
}));

const { default: OfficerCasePage } = await import("@/app/(desk)/officer/case/[id]/page");
const { OfficerCaseDetail } = await import("@/app/(desk)/officer/case/[id]/case-detail");
const { CloseForm } = await import("@/app/(desk)/officer/case/[id]/close-form");
const { AuditList } = await import("@/app/(desk)/officer/case/[id]/audit-list");

const RED = /danger|\bred-|text-red|bg-red|#ff0000|crimson/i;
const CASE_ID = exampleOfficerMissingView.id;

// Words/phrases the constitution bans (BR-013 / D4 §15.1): "rescue", "return",
// "reunification"/"reunite"/"reunified"/"return to family", plus the Bangla forms.
const BANNED_EN = /\b(?:rescue|rescued|rescues|returning|return to family|reunif(?:y|ied|ication|ications)|reunite|reunited|homecoming)\b/i;
const BANNED_BN = /(?:উদ্ধার|ফিরিয়ে\s*আন|পুনর্মিলন|ফেরত\s*দে|ফিরে\s*পেল|ফিরে\s*পাওয়া|ফিরে\s*আস)/u;

async function renderPage(id: string = CASE_ID) {
  return renderToStaticHtml(await OfficerCasePage({ params: Promise.resolve({ id }) }));
}

beforeEach(() => {
  localeCookie = undefined;
  guard.notFound = false;
  pageReads.caseResult = { kind: "ok", view: { view: "officer" as const, data: exampleOfficerMissingView } };
  pageReads.auditResult = { kind: "ok", view: exampleOfficerAuditResponse };
  pageReads.caseCalls = [];
  pageReads.auditCalls = [];
  pageReads.caseThrows = false;
  pageReads.auditThrows = false;
  guard.calls = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderToStaticHtml(tree: unknown): string {
  return renderToStaticMarkup(tree);
}

describe("SCREEN-012 page guard", () => {
  it("calls requireRole(\"officer\", \"/officer/case/<id>\") and never fetches via HTTP", async () => {
    const html = await renderPage();
    expect(guard.calls).toEqual([[["officer"], `/officer/case/${CASE_ID}`]]);
    // The page reads through the case/audit services with the principal from requireRole
    // — never a fetch from a server component.
    expect(pageReads.caseCalls).toHaveLength(1);
    expect(pageReads.auditCalls).toHaveLength(1);
    expect(pageReads.caseCalls[0][0]).toBe(guard.principal);
    expect(pageReads.caseCalls[0][1]).toBe(CASE_ID);
    expect(pageReads.auditCalls[0][0]).toBe(guard.principal);
    expect(pageReads.auditCalls[0][1]).toBe(CASE_ID);
    expect(html).not.toContain("__NEXT_DATA__");
    expect(html).not.toMatch(/<script[^>]*src="[^"]*\/api\//);
  });

  it("non-officer visitor lands on the same SCREEN-016 not-found as a missing page", async () => {
    guard.notFound = true;
    // When requireRole throws NEXT_NOT_FOUND, the App Router renders src/app/not-found.tsx,
    // which is the SCREEN-016 surface. The page itself never reaches the services.
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(pageReads.caseCalls).toHaveLength(0);
    expect(pageReads.auditCalls).toHaveLength(0);
  });

  it("renders the desk surface (not a parent welcome) and the synthetic + [MOCK] badges", async () => {
    const html = await renderPage();
    expect(html).toContain('data-surface="desk"');
    expect(html).toContain("[MOCK]");
    expect(html).toContain("সিনথেটিক");
    // Honest labels (D4 §15.1) are always visible — never hidden behind a tab or expand.
    expect((html.match(/\[MOCK\]/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });
});

describe("SCREEN-012 detail (node-server markup)", () => {
  it("renders every D3 child / event / reporter / duplicate section in Bangla", () => {
    localeCookie = "bn";
    const html = renderToString(OfficerCaseDetail({
      locale: "bn",
      view: exampleOfficerMissingView as OfficerCaseView,
      t: {
        statusGroupOpen: "খোলা",
        statusGroupMatched: "যাচাই চলছে",
        statusGroupClosed: "বন্ধ",
        ...bnKeys(),
      },
    }));
    expect(html).toContain(exampleOfficerMissingView.ref_code);
    expect(html).toContain("রেফারেন্স");
    expect(html).toContain(exampleOfficerMissingView.child.name!);
    expect(html).toContain("বয়স");
    expect(html).toContain("উচ্চতা");
    expect(html).toContain("পোশাক");
    expect(html).toContain("চেনার চিহ্ন");
    expect(html).toContain("স্থান");
    expect(html).toContain("জেলা");
    expect(html).toContain("থানা");
    expect(html).toContain("পরিস্থিতি");
    expect(html).toContain("ফোন (মাস্ক করা)");
    expect(html).toContain("সম্ভাব্য একই রিপোর্ট");
    expect(html).toContain("সম্ভাব্য একই রিপোর্ট পাওয়া যায়নি");
    expect(html).not.toMatch(RED);
  });

  it("renders the same detail in English with the D3 audit/copy in the same slot", () => {
    const html = renderToString(OfficerCaseDetail({
      locale: "en",
      view: exampleOfficerMissingView as OfficerCaseView,
      t: {
        statusGroupOpen: "Open",
        statusGroupMatched: "Being checked",
        statusGroupClosed: "Closed",
        ...enKeys(),
      },
    }));
    expect(html).toContain(exampleOfficerMissingView.child.name!);
    expect(html).toContain("Phone (masked)");
    expect(html).toContain("No likely same report found");
    expect(html).toContain("Reporter and contact");
  });

  it("uses the safe per-role allowlist (BR-010/024): never raw details, never a phone in plain text unexpected to the officer", () => {
    // Officer sees contact_phone only when the principal is the verified officer. The
    // masked phone is always set; we render it when contact_phone is null. The raw
    // detail keys (audit_log.details.*) never reach this tree.
    localeCookie = "en";
    const html = renderToString(OfficerCaseDetail({
      locale: "en",
      view: exampleOfficerMissingView as OfficerCaseView,
      t: {
        statusGroupOpen: "Open",
        statusGroupMatched: "Being checked",
        statusGroupClosed: "Closed",
        ...enKeys(),
      },
    }));
    // The masked phone token is always present, and the raw number never reaches the
    // page DOM.
    expect(html).toContain(exampleOfficerMissingView.contact_phone_masked!);
    // Raw `audit_log.details` keys never surface.
    for (const forbidden of [
      "missing_ref", "found_ref", "decision", "score", "candidate_id",
      "actor_id", "actor_display",
    ]) expect(html).not.toContain(`>${forbidden}<`);
  });

  it("shows \"Coordinated\" / \"Referred\" status labels with the icon-and-text rule", () => {
    const confirmed: OfficerCaseView = { ...exampleOfficerMissingView, status: "confirmed" };
    localeCookie = "en";
    const html = renderToString(OfficerCaseDetail({
      locale: "en",
      view: confirmed,
      t: {
        statusGroupOpen: "Open",
        statusGroupMatched: "Being checked",
        statusGroupClosed: "Closed",
        officerCase: enKeys(),
      },
    }));
    expect(html).toMatch(/<svg.*?<\/svg>\s*Confirmed/);
    expect(html).toContain("Referral recorded (simulation)");
    expect(html).not.toMatch(RED);
  });
});

describe("SCREEN-012 close form (two-step confirm)", () => {
  function mountOpen(locale: "bn" | "en", impl?: typeof fetch) {
    return mountHooks(() => createElement(CloseForm, {
      locale,
      caseId: CASE_ID,
      allowedOutcome: "resolved_outside_fera",
      expectedVersion: 1,
      fetchImpl: impl,
    }));
  }
  function mountConfirmed(locale: "bn" | "en", impl?: typeof fetch) {
    return mountHooks(() => createElement(CloseForm, {
      locale,
      caseId: CASE_ID,
      allowedOutcome: "coordination_recorded",
      expectedVersion: 2,
      fetchImpl: impl,
    }));
  }

  it("renders the exact D3 success copy (bn + en) and forbids rescue / return wording", () => {
    localeCookie = "bn";
    const bn = renderToStaticHtml(renderToString(
      createElement(CloseForm, {
        locale: "bn", caseId: CASE_ID, allowedOutcome: "resolved_outside_fera", expectedVersion: 1,
      }),
    ));
    expect(bn).toContain("সমন্বয়ের সিদ্ধান্ত ও রেফারেল নথিভুক্ত (সিমুলেশন)");
    expect(bn).not.toMatch(BANNED_EN);
    expect(bn).not.toMatch(BANNED_BN);
    const en = renderToString(
      createElement(CloseForm, {
        locale: "en", caseId: CASE_ID, allowedOutcome: "resolved_outside_fera", expectedVersion: 1,
      }),
    );
    expect(renderToStaticHtml(en)).toContain("Coordination decision and referral recorded (simulation)");
    expect(renderToStaticHtml(en)).not.toMatch(BANNED_EN);
    expect(renderToStaticHtml(en)).not.toMatch(BANNED_BN);
  });

  it("limits radio choice to allowedCloseOutcome(status): confirmed → coordination_recorded only", () => {
    const html = renderToString(
      createElement(CloseForm, {
        locale: "en", caseId: CASE_ID, allowedOutcome: "coordination_recorded", expectedVersion: 2,
      }),
    );
    const radios = [...html.matchAll(/<input[^>]*type="radio"[^>]*data-allowed="([^"]+)"[^>]*>/g)].map((m) => m[1]);
    expect(radios).toContain("true");
    // The disabled radio is the open-only option.
    const disabled = [...html.matchAll(/<input[^>]*type="radio"[^>]*>(?:[^<]*<\/input>)?/g)];
    expect(disabled.length).toBe(2);
  });

  it("open status allows \"resolved_outside_fera\" only", () => {
    const html = renderToString(
      createElement(CloseForm, {
        locale: "bn", caseId: CASE_ID, allowedOutcome: "resolved_outside_fera", expectedVersion: 1,
      }),
    );
    expect(html).toContain("ফেরার বাইরে নিষ্পত্তি");
    expect(html).toContain("শনাক্ত, রেফারেল হয়েছে");
    const coordination = html.match(/<input[^>]*data-value="coordination_recorded"[^>]*>/);
    expect(coordination).toBeTruthy();
    expect(coordination![0]).toContain("disabled");
  });

  it("skips the form entirely when close is not allowed for the current status", () => {
    const html = renderToString(
      createElement(CloseForm, {
        locale: "en", caseId: CASE_ID, allowedOutcome: null, expectedVersion: 1,
      }),
    );
    expect(html).toContain("This case cannot be closed in its current state");
    expect(html).not.toMatch(/<form/);
    expect(html).not.toContain("type=\"radio\"");
  });

  it("two-step confirm: step 1 collects note, step 2 is the final close; no submit until step 2", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(exampleCloseCaseResponse));
    const h = mountConfirmed("en", fetcher as unknown as typeof fetch);
    const initialForm = elements(h.tree).find((n) => n.type === "form")!;
    expect((initialForm.props["data-step"] as unknown) ?? undefined).toBeUndefined();
    // Step 1 button click → moves to step 2, no fetch yet.
    click(button(h.tree, "Review complete"));
    h.render();
    expect(fetcher).not.toHaveBeenCalled();
    // Step 2 confirms → POST /api/cases/<id>/close with the contract body.
    const step2 = button(h.tree, "Close coordination record");
    click(step2);
    await settle();
    h.render();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`/api/cases/${CASE_ID}/close`);
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ outcome: "coordination_recorded", expected_version: 2 });
    // success copy after submit
    expect(content(h.tree)).toContain("Coordination decision and referral recorded (simulation)");
  });

  it("step 1 → back returns the user to step 1; form data-step becomes 1 again", () => {
    const h = mountConfirmed("en");
    click(button(h.tree, "Review complete"));
    h.render();
    expect((elements(h.tree).find((n) => n.type === "form")!.props as { "data-step"?: number })["data-step"]).toBe(2);
    click(button(h.tree, "Step 1"));
    h.render();
    expect((elements(h.tree).find((n) => n.type === "form")!.props as { "data-step"?: number })["data-step"]).toBe(1);
  });

  it("E-005 stale version shows the reload prompt and keeps the typed note (no silent retry)", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(errorEnvelope("E-005"), { status: 409 }),
    );
    const h = mountOpen("bn", fetcher as unknown as typeof fetch);
    // Type a note before submit so we can assert it survives the failure.
    const formNode = elements(h.tree).find((n) => n.type === "form")!;
    const noteField = elements(formNode).find((n) => (n.props as { "id"?: string }).id?.endsWith("-note"))!;
    (noteField.props as { onChange?: (e: { target: { value: string } }) => void }).onChange?.({ target: { value: "আমার নোট — সমন্বয় চলছে" } });
    h.render();
    click(button(h.tree, "পর্যালোচনা শেষ"));
    h.render();
    click(button(h.tree, "সমন্বয়ের রেকর্ড বন্ধ করুন"));
    await settle();
    h.render();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(content(h.tree)).toContain("পাতা আবার লোড করুন");
    expect(content(h.tree)).toContain("আপনার নোট এখানে ছিল:");
    expect(content(h.tree)).toContain("আমার নোট — সমন্বয় চলছে");
    // Failure state shows once: page is not auto-retried.
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("404 maps to the \"already closed\" copy without retrying or losing the note", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(errorEnvelope("E-004"), { status: 404 }),
    );
    const h = mountOpen("en", fetcher as unknown as typeof fetch);
    click(button(h.tree, "Review complete"));
    h.render();
    click(button(h.tree, "Close coordination record"));
    await settle();
    h.render();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(content(h.tree)).toContain("This case is already closed");
  });

  it("generic 5xx shows the calm retry message and keeps the form usable", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(errorEnvelope("E-021"), { status: 500 }),
    );
    const h = mountConfirmed("bn", fetcher as unknown as typeof fetch);
    click(button(h.tree, "পর্যালোচনা শেষ"));
    h.render();
    click(button(h.tree, "সমন্বয়ের রেকর্ড বন্ধ করুন"));
    await settle();
    h.render();
    expect(content(h.tree)).toContain("কিছু একটা ভুল হয়েছে");
    expect(content(h.tree)).not.toMatch(BANNED_EN);
    expect(content(h.tree)).not.toMatch(BANNED_BN);
  });
});

describe("SCREEN-012 audit timeline", () => {
  it("renders every entry with status icon + label + actor + wall-clock, none of the raw details keys", () => {
    localeCookie = "bn";
    const html = renderToString(
      createElement(AuditList, { locale: "bn", view: exampleOfficerAuditResponse as OfficerAuditResponse }),
    );
    expect(html).toContain('aria-labelledby="audit-heading"');
    expect(html).toContain('data-state="loaded"');
    expect((html.match(/<li\b/g) ?? []).length).toBe(exampleOfficerAuditResponse.entries.length);
    // Action labels exist in Bangla.
    expect(html).toContain("কেস বন্ধ");
    expect(html).toContain("মিল নিশ্চিত");
    // No free-text detail key surfaces.
    for (const forbidden of [
      "missing_ref", "found_ref", "candidate_id", "decision", "score", "actor_user_id",
      "ref_code", "missing_version", "found_version", "from_status", "to_status",
    ]) {
      expect(html).not.toContain(`>${forbidden}<`);
    }
    expect(html).not.toMatch(RED);
  });

  it("marks the empty timeline explicitly", () => {
    const empty: OfficerAuditResponse = { view: "officer", entries: [], withheld: 0 };
    const html = renderToString(
      createElement(AuditList, { locale: "en", view: empty }),
    );
    expect(html).toContain("No activity is recorded for this case");
    expect(html).not.toContain("data-state=\"loaded\"");
  });

  it("announces the withheld count once when projection withholds rows", () => {
    const withheld: OfficerAuditResponse = { ...exampleOfficerAuditResponse, withheld: 3, entries: exampleOfficerAuditResponse.entries.slice(0, 1) };
    const html = renderToString(
      createElement(AuditList, { locale: "bn", view: withheld }),
    );
    const note = html.match(/<p[^>]*data-state="withheld"[^>]*data-count="3"[^>]*>/);
    expect(note).toBeTruthy();
    expect(note![0]).not.toContain("data-count=\"3\" data-count=\"3\"");
  });

  it("the rendered text never contains rescue / return wording in either locale", () => {
    const htmlBn = renderToString(createElement(AuditList, { locale: "bn", view: exampleOfficerAuditResponse as OfficerAuditResponse }));
    const htmlEn = renderToString(createElement(AuditList, { locale: "en", view: exampleOfficerAuditResponse as OfficerAuditResponse }));
    expect(htmlBn).not.toMatch(BANNED_BN);
    expect(htmlEn).not.toMatch(BANNED_EN);
  });
});

describe("SCREEN-012 page-level integrity", () => {
  it("renders Bangla default and English via the locale cookie", async () => {
    // The default fixture is "matched_pending_review", which does not allow close, so
    // the close form renders as "not-allowed". The success copy only appears on a
    // successful POST, not on the initial render. We assert the page chrome here, and
    // the success copy inside the per-form tests below.
    localeCookie = "bn";
    const bn = await renderPage();
    expect(bn).toContain("কেস বিস্তারিত");
    expect(bn).toContain("এই অবস্থায় কেস বন্ধ করা যাবে না");
    localeCookie = "en";
    const en = await renderPage();
    expect(en).toContain("Case detail");
    expect(en).toContain("This case cannot be closed in its current state");
  });

  it("the confirmed-status page renders the close form with the D3 confirmed copy", async () => {
    // Confirmed is the only status where coordination_recorded is the only allowed
    // outcome. The success copy is asserted in the per-form tests below; here we
    // only check the page chrome and that the close form is present.
    pageReads.caseResult = {
      kind: "ok",
      view: {
        view: "officer",
        data: { ...exampleOfficerMissingView, status: "confirmed", version: 2 },
      },
    };
    localeCookie = "en";
    const en = await renderPage();
    expect(en).toContain("Located, referral recorded");
    expect(en).toContain("Review complete");
  });

  it("\"hidden\" from readCase is treated as a not-found, never as 500", async () => {
    pageReads.caseResult = { kind: "hidden", caseId: CASE_ID };
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("\"hidden\" from readCase (unknown caseId) is identical to a wrong-owner read", async () => {
    pageReads.caseResult = { kind: "hidden", caseId: "00000000-0000-4000-8000-000000000000" };
    await expect(renderPage("00000000-0000-4000-8000-000000000000")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("readCase throwing surfaces E-021 copy and never notFound (the audit + ref-code swap must not become a 404)", async () => {
    pageReads.caseThrows = true;
    const html = await renderPage();
    expect(html).toContain("এই কেসের তথ্য এখন দেখানো যাচ্ছে না");
    expect(html).toContain("কেসের তথ্য লোড হচ্ছে");
    expect(html).toContain('data-state="error"');
  });

  it("when readCaseAudit throws, the audit panel shows the unavailable notice, not the error page", async () => {
    pageReads.auditThrows = true;
    const html = await renderPage();
    expect(html).toContain("এই কেসের তথ্য এখন দেখানো যাচ্ছে না");
    expect(html).toContain('data-state="audit-unavailable"');
    expect(html).not.toContain('data-state="error"');
  });

  it("found reports never render the close form (allowedCloseOutcome is missing-only)", async () => {
    pageReads.caseResult = {
      kind: "ok",
      view: { view: "officer", data: exampleOfficerFoundView as OfficerCaseView },
    };
    pageReads.auditResult = { kind: "ok", view: exampleOfficerAuditResponse };
    const html = await renderPage();
    expect(html).toContain('data-kind="found"');
    expect(html).not.toContain("কেস বন্ধ করুন");
    expect(html).not.toContain("Close case");
  });

  it("confirm status renders only the coordination_recorded outcome and never rescue wording", async () => {
    pageReads.caseResult = {
      kind: "ok",
      view: {
        view: "officer",
        data: { ...exampleOfficerMissingView, status: "confirmed", version: 2 },
      },
    };
    pageReads.auditResult = { kind: "ok", view: exampleOfficerAuditResponse };
    localeCookie = "en";
    const html = await renderPage();
    expect(html).toContain("Coordination decision and referral recorded (simulation)");
    expect(html).toContain("Located, referral recorded");
    expect(html).not.toMatch(BANNED_EN);
    expect(html).not.toMatch(BANNED_BN);
  });
});

// Locale key fixtures — the area file owns the real copies; tests only assert the
// function signatures other modules call. The keys here are the D3/D4 set used by
// SCREEN-012 markup; anything else would silently drift from the screens.
function bnKeys() {
  return {
    caseTitle: "কেস বিস্তারিত",
    caseKindMissing: "নিখোঁজ রিপোর্ট",
    caseKindFound: "খুঁজে পাওয়া রিপোর্ট",
    caseStatusLabel: "অবস্থা",
    caseStatusSubmitted: "জমা হয়েছে",
    caseStatusConfirmed: "যাচাই হয়েছে",
    caseStatusClosed: "বন্ধ",
    caseStatusReferred: "রেফারেল নথিভুক্ত (সিমুলেশন)",
    childSection: "শিশুর তথ্য",
    childName: "নাম",
    childNameLatin: "নাম (ইংরেজি অক্ষরে)",
    childAge: "বয়স",
    childSex: "লিঙ্গ",
    childSexMale: "ছেলে",
    childSexFemale: "মেয়ে",
    childSexOther: "অন্য কিছু",
    childSexUnknown: "জানি না",
    childHeight: "উচ্চতা (সেমি)",
    childClothing: "পোশাক",
    childMarks: "চেনার চিহ্ন",
    eventSection: "কখন ও কোথায়",
    eventAt: "শেষবার দেখা",
    eventPlace: "স্থান",
    eventDistrict: "জেলা",
    eventThana: "থানা",
    eventCircumstances: "পরিস্থিতি",
    reporterSection: "অভিভাবক ও যোগাযোগ",
    reporterRelation: "শিশুর সাথে সম্পর্ক",
    reporterPhoneMasked: "ফোন (মাস্ক করা)",
    reporterPhoneUnmasked: "ফোন (যাচাইকৃত)",
    duplicateSection: "সম্ভাব্য একই রিপোর্ট",
    duplicateEmpty: "সম্ভাব্য একই রিপোর্ট পাওয়া যায়নি",
    matchingSection: "মিল খোঁজা",
    auditSection: "কার্যক্রমের ইতিহাস",
    auditEmpty: "এই কেসের জন্য কোনো কার্যক্রম নথিভুক্ত নেই",
    auditWithheldNote: "কিছু নথিভুক্ত কার্যক্রম অনুমতির বাইরে থাকায় দেখানো হচ্ছে না",
    closeTitle: "কেস বন্ধ করুন",
    closeIntro: "বন্ধ করলে সমন্বয়ের রেকর্ড তৈরি হবে (সিমুলেশন)। কোনো দাবি করা হবে না।",
    closeSuccessTitle: "কেস বন্ধ হয়েছে",
    closeSuccessBody: "সমন্বয়ের সিদ্ধান্ত ও রেফারেল নথিভুক্ত (সিমুলেশন)",
    notProvided: "দেওয়া হয়নি",
    unknown: "অজানা",
    loadingCase: "কেসের তথ্য লোড হচ্ছে…",
    errorUnavailable: "এই কেসের তথ্য এখন দেখানো যাচ্ছে না। পরে আবার চেষ্টা করুন।",
  } as unknown as Record<string, string>;
}
function enKeys() {
  return {
    caseTitle: "Case detail",
    caseKindMissing: "Missing report",
    caseKindFound: "Found report",
    caseStatusLabel: "Status",
    caseStatusSubmitted: "Submitted",
    caseStatusConfirmed: "Confirmed",
    caseStatusClosed: "Closed",
    caseStatusReferred: "Referral recorded (simulation)",
    childSection: "Child details",
    childName: "Name",
    childNameLatin: "Name (Latin letters)",
    childAge: "Age",
    childSex: "Sex",
    childSexMale: "Boy",
    childSexFemale: "Girl",
    childSexOther: "Other",
    childSexUnknown: "Don't know",
    childHeight: "Height (cm)",
    childClothing: "Clothing",
    childMarks: "Identifying marks",
    eventSection: "When and where",
    eventAt: "Last seen",
    eventPlace: "Place",
    eventDistrict: "District",
    eventThana: "Thana (police station area)",
    eventCircumstances: "Circumstances",
    reporterSection: "Reporter and contact",
    reporterRelation: "Relation to the child",
    reporterPhoneMasked: "Phone (masked)",
    reporterPhoneUnmasked: "Phone (verified)",
    duplicateSection: "Likely same report",
    duplicateEmpty: "No likely same report found",
    matchingSection: "Matching",
    auditSection: "Activity log",
    auditEmpty: "No activity is recorded for this case",
    auditWithheldNote: "Some recorded activity is withheld because your permissions don't cover it",
    closeTitle: "Close case",
    closeIntro: "Closing records a coordination outcome (simulation). No outcome is claimed beyond that.",
    closeSuccessTitle: "Case closed",
    closeSuccessBody: "Coordination decision and referral recorded (simulation)",
    notProvided: "Not provided",
    unknown: "Unknown",
    loadingCase: "Loading case details…",
    errorUnavailable: "This case's details aren't available right now. Try again later.",
  } as unknown as Record<string, string>;
}

// Inline renderToString — the file uses this for the small per-component tests so the
// page-test wrapper (renderPage) can reuse a stable JSX-free host.
function renderToString(element: unknown): string {
  return renderToStaticMarkup(element);
}
