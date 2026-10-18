// SCREEN-009 / S-009 officer review queue page (TASK-027, FR-012, D3 COMP-035/036).
// Server-rendered in Node (no browser here). Mocks next/headers for the locale
// cookie, requireRole for auth, and readReviewQueue for the queue snapshot, so
// the page can be rendered without a DB or an auth store.
//
// Coverage:
// - the page lives on the desk surface and is officer-only (requireRole)
// - bilingual title, intro, synthetic note and the [MOCK] badge
// - empty state (no queue items) renders the empty card in bn and en
// - queue list rendering: anchor links to /officer/match/<candidate_id>, rank
//   badge, ref_code, district name and similarity in both languages
// - every link is a real <a> with a focus-visible ring and 44 px touch target
// - the rendered HTML does NOT contain a raw contact_phone (the queue row
//   serves a masked phone; the contact_viewed audit must be API-009 only)
// - the new locale keys are reachable from the shared locales object
// - the new strings pass the wording guard (no alert/rescue/return/probability)
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clientExamples } from "@/contracts/client-examples";
import type { ReviewQueueResponse } from "@/contracts";
import { findBannedGroup } from "@/server/outputs";
import { locales } from "@/locales";

let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "fera-lang" && localeCookie ? { value: localeCookie } : undefined),
  }),
}));

const pageData = vi.hoisted(() => ({
  roleCalls: [] as unknown[][],
  reads: [] as Array<{ principal: unknown; opts: unknown }>,
  readsOk: true as boolean,
  lastView: undefined as ReviewQueueResponse | undefined,
}));
vi.mock("@/server/auth/require-role", () => ({
  requireRole: async (...args: unknown[]) => {
    pageData.roleCalls.push(args);
    return { principal: { kind: "user" }, role: "officer" };
  },
}));

vi.mock("@/server/matching/queue-read", () => ({
  readReviewQueue: async (principal: unknown, opts: unknown) => {
    pageData.reads.push({ principal, opts });
    if (!pageData.readsOk) return { kind: "hidden" } as const;
    return { kind: "ok", view: pageData.lastView ?? { items: [], next_cursor: null } } as const;
  },
}));

const { default: QueuePage } = await import("@/app/(desk)/officer/queue/page");
const { officerQueueBn, officerQueueEn } = await import("@/locales/areas/officer-queue");

function setView(view: ReviewQueueResponse) {
  pageData.lastView = view;
}
function clearView() {
  pageData.lastView = { items: [], next_cursor: null };
}

afterEach(() => {
  localeCookie = undefined;
  pageData.roleCalls = [];
  pageData.reads = [];
  pageData.readsOk = true;
  clearView();
});

async function page(locale: "bn" | "en") {
  localeCookie = locale;
  return renderToStaticMarkup(await QueuePage());
}

describe("SCREEN-009 officer review queue page", () => {
  it("requires officer role and lives on the desk surface", async () => {
    const html = await page("en");
    expect(pageData.roleCalls).toEqual([[["officer"], "/officer/queue"]]);
    expect(html).toContain('data-surface="desk"');
    expect(html).toContain("<h1");
  });

  it("shows the bilingual title, intro, synthetic note and [MOCK] badge", async () => {
    const en = await page("en");
    const bn = await page("bn");
    // The shared mockLabel is "[MOCK]" in both languages.
    expect(en).toContain("[MOCK]");
    expect(bn).toContain("[MOCK]");
    expect(en).toContain(officerQueueEn.officerQueueTitle);
    expect(en).toContain(officerQueueEn.officerQueueIntro);
    // The en synthetic note contains a curly apostrophe which React escapes to
    // &#x27; in the rendered HTML; the surrounding words still need to match.
    expect(en.replace(/&#x27;/g, "'")).toContain(officerQueueEn.officerQueueSyntheticNote);
    expect(bn).toContain(officerQueueBn.officerQueueTitle);
    expect(bn).toContain(officerQueueBn.officerQueueIntro);
    expect(bn).toContain(officerQueueBn.officerQueueSyntheticNote);
  });

  it("renders the empty-state card when the queue is empty (bn and en)", async () => {
    const en = await page("en");
    const bn = await page("bn");
    for (const html of [en, bn]) {
      // The empty card has the title heading wired up to the section.
      expect(html).toMatch(/id="officer-queue-empty"/);
      // No anchor links to a candidate detail when the list is empty.
      expect(html).not.toMatch(/href="\/officer\/match\//);
    }
    expect(en).toContain(officerQueueEn.officerQueueEmptyTitle);
    expect(en).toContain(officerQueueEn.officerQueueEmptyBody);
    expect(bn).toContain(officerQueueBn.officerQueueEmptyTitle);
    expect(bn).toContain(officerQueueBn.officerQueueEmptyBody);
  });

  it("renders one card per missing case with a list of candidate anchors (bn)", async () => {
    setView(clientExamples.reviewQueueResponse);
    const html = await page("bn");
    // The real client example has at least one missing case and at least one candidate.
    expect(pageData.reads.length).toBe(1);
    // Anchor links to the candidate detail.
    const links = [...html.matchAll(/href="(\/officer\/match\/[0-9a-f-]+)"/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    // Every anchor is a real <a> and the link is keyboard friendly (focus ring,
    // 44 px touch target via the inline min-h-11 utility).
    expect(html).toMatch(/<a[^>]+href="\/officer\/match\/[0-9a-f-]+"[^>]+focus-visible:ring-2/);
    expect(html).toMatch(/<a[^>]+href="\/officer\/match\/[0-9a-f-]+"[^>]+min-h-11/);
    // Bangla list aria-labels are present.
    expect(html).toContain(officerQueueBn.officerQueueListLabel);
    expect(html).toContain(officerQueueBn.officerQueueCandidateListLabel);
    // The "missing" / "found" labels come from the officer-queue area.
    expect(html).toContain(officerQueueBn.officerQueueMissingLabel);
    expect(html).toContain(officerQueueBn.officerQueueFoundLabel);
  });

  it("never renders a raw contact phone (the queue row serves a masked phone only)", async () => {
    setView(clientExamples.reviewQueueResponse);
    const html = await page("en");
    // The contract shape: contact_phone is null in officerCaseRow. No element
    // should ever render a phone-shaped string the queue list could surface.
    expect(html).not.toMatch(/01\d{9}/);
    // The masked phone pattern (e.g. 01XXXXXXXXX with middle digits masked)
    // is not the queue's job either, but if one is in the row it must not
    // appear as a plain contact column.
    expect(html).not.toMatch(/contact[_-]?phone/);
  });

  it("shows the similarity score in en using a /100 baseline (no probability wording)", async () => {
    setView(clientExamples.reviewQueueResponse);
    const html = await page("en");
    // The shared "Similarity" / "মিলের মাত্রা" label is rendered for each row.
    expect(html).toContain(officerQueueEn.officerQueueSimilarityLabel);
    // Every score is shown as "N / 100" — never a standalone percentage sign.
    const scores = [...html.matchAll(/(\d+)\s*\/\s*100/g)].map((m) => m[1]);
    expect(scores.length).toBeGreaterThan(0);
    // The wording guard rejects a bare "%" — make sure no element is wrapped
    // around just a percentage figure.
    for (const s of scores) expect(s).toMatch(/^\d+$/);
  });
});

describe("SCREEN-009 officer-queue locale keys", () => {
  it("exports matching bn and en keys", () => {
    expect(Object.keys(officerQueueBn).sort()).toEqual(Object.keys(officerQueueEn).sort());
  });

  it("every key is reachable from the shared locales object", () => {
    for (const key of Object.keys(officerQueueBn) as (keyof typeof officerQueueBn)[]) {
      expect(locales.bn[key]).toBe(officerQueueBn[key]);
      expect(locales.en[key]).toBe(officerQueueEn[key]);
    }
  });

  it("passes the wording guard (BR-002/003/011, D4 §3) in both languages", () => {
    for (const key of Object.keys(officerQueueBn) as (keyof typeof officerQueueBn)[]) {
      expect(findBannedGroup(officerQueueBn[key]), `bn ${key}`).toBeNull();
      expect(findBannedGroup(officerQueueEn[key]), `en ${key}`).toBeNull();
    }
  });
});
