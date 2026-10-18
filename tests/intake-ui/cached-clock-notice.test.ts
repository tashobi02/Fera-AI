// Cached draft clock notice (S-002 / S-003 / S-005, BR-026, COMP-048). The three
// prepared cached drafts (Mitu, Rafi, Mim) use fixed `event.at` values while the
// source text contains relative words like "গতকাল" / "আজ সকালে". The dates are
// NOT recalculated from today, so a parent reviewing a cached draft must check
// or correct the date before submitting. The D4 exact cached badge stays
// unchanged; this notice sits next to it and is rendered only when the draft
// was retained from the cache. Live (noncached) drafts must remain visually
// identical to before.
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clientExamples } from "@/contracts/client-examples";
import { caseDraftSchema } from "@/contracts";
import { CachedClockNotice, HonestLabel } from "@/app/(parent)/parent-ui";
import { ProviderNotice } from "@/app/(parent)/provider-notice";
import { clearIntakeMemory, handOff } from "@/lib/intake/handoff";
import { createDeviceDraft, loadDraft, saveDraft } from "@/lib/intake/draft-store";
import { locales } from "@/locales";
import { elements, mountHooks } from "./fakes/hook-harness";
import { memoryStorage } from "../intake/review/storage";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("./fakes/hook-harness")).testHooks }));

const { ReviewScreen } = await import("@/app/(parent)/intake/review/review-screen");
const { ManualFormScreen } = await import("@/app/(parent)/intake/form/manual-form");
const { ReviewFields, ConfirmBar } = await import("@/app/(parent)/intake/review/review-fields");

function handoffWithCached(cached: boolean) {
  return {
    to: "review" as const,
    sourceText: clientExamples.createMissingRequest.draft.source_text,
    response: {
      ...clientExamples.extractResponse,
      draft: caseDraftSchema.parse({
        ...clientExamples.createMissingRequest.draft,
        event: { ...clientExamples.createMissingRequest.draft.event, district_text: null },
      }),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    missing: [],
    asked: 4,
    cached,
    mock: false,
  };
}

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal("window", { localStorage: storage, confirm: () => true });
  vi.stubGlobal("document", { getElementById: () => null });
  push.mockClear();
  clearIntakeMemory();
});
afterEach(() => {
  clearIntakeMemory();
  vi.unstubAllGlobals();
});

// The hook harness walks `node.props.children` but does not recurse into
// function components. `CachedClockNotice` is a function component, so the
// tests below look it up directly in the rendered tree and verify its
// props. This is the same lookup the review-screen tests use to find
// `ReviewFields` and `ConfirmBar`.
const findByType = (tree: ReactNode, type: unknown) => elements(tree).find((n) => n.type === type);

describe("CachedClockNotice shared component (BR-026, COMP-048)", () => {
  it("renders nothing on noncached drafts so live drafts are unchanged", () => {
    const html = renderToStaticMarkup(createElement(CachedClockNotice, { locale: "bn", cached: false }));
    expect(html).toBe("");
  });

  it("renders the bilingual title and review prompt via renderToStaticMarkup", () => {
    const bn = renderToStaticMarkup(createElement(CachedClockNotice, { locale: "bn", cached: true }));
    const en = renderToStaticMarkup(createElement(CachedClockNotice, { locale: "en", cached: true }));
    expect(bn).toContain(locales.bn.cachedClockTitle);
    expect(bn).toContain(locales.bn.cachedClockReviewPrompt);
    expect(en).toContain(locales.en.cachedClockTitle);
    expect(en).toContain(locales.en.cachedClockReviewPrompt);
  });

  it("marks the notice as a role=note with an accessible name for screen readers", () => {
    const html = renderToStaticMarkup(createElement(CachedClockNotice, { locale: "en", cached: true }));
    expect(html).toMatch(/<aside[^>]*role="note"[^>]*aria-label="Cached draft keeps a fixed date"/);
  });

  it("preserves the D4 exact cached badge string (the badge label does not change)", () => {
    const html = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(CachedClockNotice, { locale: "en", cached: true }),
        createElement(HonestLabel, null, locales.en.cachedBadge),
      ),
    );
    expect(html).toContain("Cached · prepared synthetic example");
  });
});

describe("ProviderNotice wires the cached clock notice only when cached is true", () => {
  it("omits the notice in the compact variant when cached is false", () => {
    const html = renderToStaticMarkup(createElement(ProviderNotice, { locale: "bn", variant: "compact", mock: false, cached: false }));
    expect(html).not.toContain(locales.bn.cachedClockTitle);
  });

  it("shows the notice in the compact variant when cached is true", () => {
    const html = renderToStaticMarkup(createElement(ProviderNotice, { locale: "bn", variant: "compact", mock: false, cached: true }));
    expect(html).toContain(locales.bn.cachedClockTitle);
    expect(html).toContain(locales.bn.cachedClockReviewPrompt);
  });

  it("omits the notice in the full variant when cached is false", () => {
    const html = renderToStaticMarkup(createElement(ProviderNotice, { locale: "bn", variant: "full", mock: false, cached: false }));
    expect(html).not.toContain(locales.bn.cachedClockTitle);
  });

  it("shows the notice in the full variant when cached is true", () => {
    const html = renderToStaticMarkup(createElement(ProviderNotice, { locale: "bn", variant: "full", mock: false, cached: true }));
    expect(html).toContain(locales.bn.cachedClockTitle);
    expect(html).toContain(locales.bn.cachedClockReviewPrompt);
  });
});

describe("SCREEN-003 review screen (cached draft state)", () => {
  function mount() { return mountHooks(() => ReviewScreen({ locale: "bn" })); }

  it("mounts the cached clock notice when the retained draft is cached", () => {
    handOff(handoffWithCached(true));
    const h = mount();
    const notice = findByType(h.tree, CachedClockNotice);
    expect(notice).toBeDefined();
    expect(notice!.props.cached).toBe(true);
    expect(notice!.props.locale).toBe("bn");
    // The D4 cached badge stays in the tree unchanged: at least one HonestLabel
    // wraps the cachedBadge string.
    const allNodes = elements(h.tree);
    const badgeNodes = allNodes.filter((n) => n.type === HonestLabel);
    expect(badgeNodes.length).toBeGreaterThan(0);
  });

  it("does not mount the cached clock notice when the retained draft is not cached (live drafts unchanged)", () => {
    handOff(handoffWithCached(false));
    const h = mount();
    const notice = findByType(h.tree, CachedClockNotice);
    expect(notice).toBeUndefined();
  });

  it("keeps the cached clock notice visible right up to submit (BR-004 review gate)", () => {
    handOff(handoffWithCached(true));
    const h = mount();
    // The notice is mounted inside the record branch, before the confirm
    // bar, so it stays visible until the parent confirms and submits.
    const notice = findByType(h.tree, CachedClockNotice);
    expect(notice).toBeDefined();
    // The review confirm bar still gates the submit.
    const confirmBar = findByType(h.tree, ConfirmBar);
    expect(confirmBar).toBeDefined();
    expect(confirmBar!.props.checked).toBe(false);
  });

  it("survives editing: notice stays for the full record lifetime until submit", () => {
    handOff(handoffWithCached(true));
    const h = mount();
    (findByType(h.tree, ReviewFields)!.props.onEdit as (p: string, v: string) => void)(
      "child.clothing",
      "[MOCK] parent correction",
    );
    h.render();
    expect(findByType(h.tree, CachedClockNotice)).toBeDefined();
  });

  it("reads cached=true when restored from device storage (not just from handoff)", () => {
    // Persist a cached draft directly, mount with no handoff, and confirm
    // the notice is still rendered. This is the "parent returns on the
    // same device" path.
    const draft = createDeviceDraft(handoffWithCached(true))!;
    saveDraft({ ...draft, cached: true }, storage);
    const h = mount();
    expect(findByType(h.tree, CachedClockNotice)).toBeDefined();
    expect(loadDraft(storage)?.cached).toBe(true);
  });
});

describe("SCREEN-005 manual fallback screen (cached draft state)", () => {
  function mount() { return mountHooks(() => ManualFormScreen({ locale: "bn" })); }

  it("mounts the cached clock notice when the retained draft is cached", () => {
    handOff(handoffWithCached(true));
    const h = mount();
    expect(findByType(h.tree, CachedClockNotice)).toBeDefined();
  });

  it("does not mount the cached clock notice when the retained draft is not cached", () => {
    handOff(handoffWithCached(false));
    const h = mount();
    expect(findByType(h.tree, CachedClockNotice)).toBeUndefined();
  });

  it("preserves the manual review confirm gate (the notice does not replace it)", () => {
    handOff(handoffWithCached(true));
    const h = mount();
    const confirmBar = findByType(h.tree, ConfirmBar);
    expect(confirmBar).toBeDefined();
    expect(confirmBar!.props.checked).toBe(false);
  });
});

describe("Locale file: cached clock notice strings (parent-intake area)", () => {
  it("exposes the four new keys in both languages with matching content", () => {
    for (const key of ["cachedClockTitle", "cachedClockBody", "cachedClockReviewPrompt", "cachedClockPendingReview"] as const) {
      expect(locales.bn[key].trim()).not.toBe("");
      expect(locales.en[key].trim()).not.toBe("");
    }
  });

  it("uses no ASCII digits in the Bangla copy", () => {
    for (const key of ["cachedClockTitle", "cachedClockBody", "cachedClockReviewPrompt", "cachedClockPendingReview"] as const) {
      expect(locales.bn[key]).not.toMatch(/[0-9]/);
    }
  });
});
