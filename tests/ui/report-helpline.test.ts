// TASK-047 / P3-101: S-004 helpline card on the merged tree (FR-010, TC-007).
// TC-007 is already covered at the service layer (tests/outputs/service.test.ts
// line ~61) and at the template layer (tests/outputs/templates.test.ts line ~144).
// This file proves the S-004 path: the report screen's helpline card exists with
// the same draft/simulation label as the GD and poster cards, it requests output
// type "helpline" through API-006, and the worst-case summary stays <= 80 words
// after rendering. Same harness and fakes as tests/ui/report-screen.test.ts:
// renderToStaticMarkup in Node, with next/headers and requireOwnCase mocked.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countWords,
  OUTPUT_DRAFT_LABEL_BN,
  type OwnerCaseView,
  type OutputResponse,
} from "@/contracts";
import { exampleOutputResponse, exampleOwnerCaseView } from "@/contracts/examples";
import { TEMPLATES } from "@/server/outputs/templates";
import { requestOutput, type FetchLike } from "@/lib/outputs-client";

let localeCookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "fera-lang" && localeCookie
        ? { value: localeCookie }
        : undefined,
  }),
}));

const guard = vi.hoisted(() => ({
  view: null as unknown,
  calls: [] as unknown[][],
}));
vi.mock("@/server/auth/require-own-case", () => ({
  requireOwnCase: async (...args: unknown[]) => {
    guard.calls.push(args);
    return { principal: { kind: "parent" }, view: guard.view };
  },
}));

const { default: ReportPage } = await import("@/app/(parent)/report/[id]/page");
const { OutputText } = await import("@/app/(parent)/report/[id]/ui");

async function renderReport(view: OwnerCaseView, locale?: "bn" | "en") {
  guard.view = view;
  localeCookie = locale;
  return renderToStaticMarkup(
    await ReportPage({ params: Promise.resolve({ id: view.id }) }),
  );
}

beforeEach(() => {
  guard.view = exampleOwnerCaseView;
  localeCookie = undefined;
  guard.calls = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Extract the helpline card's section by slicing between the "১৩২১৯-এ বলার জন্য
// সারাংশ" title (set by CardShell for type "helpline") and the next card's title.
function helplineCardScope(html: string): string | null {
  const start = html.indexOf("১৩২১৯-এ বলার জন্য সারাংশ");
  if (start === -1) return null;
  const end = html.indexOf("থানায় জমা দেওয়ার জিডির খসড়া", start);
  return html.slice(start, end === -1 ? html.length : end);
}

describe("S-004 helpline card on the report screen", () => {
  it("renders the helpline card with the same draft/simulation label as GD and poster", async () => {
    const html = await renderReport(exampleOwnerCaseView);
    // All three cards carry the fixed "খসড়া — নিজে জমা দিন" label (BR-002, D3 S-004).
    expect(html.match(/খসড়া — নিজে জমা দিন/g)).toHaveLength(3);
    // The helpline card itself has the label inside its own scope, not just the page.
    const scope = helplineCardScope(html);
    expect(scope).not.toBeNull();
    expect(scope!).toContain("খসড়া — নিজে জমা দিন");
    // The card's title (set by CardShell for type="helpline") and its D3 action button
    // (set by ACTION_KEY.helpline) both appear on the page.
    expect(html).toContain("১৩২১৯-এ বলার জন্য সারাংশ");
    expect(html).toMatch(/<button[^>]*>১৩২১৯ সারাংশ<\/button>/);
  });

  it("keeps the helpline card hidden when the owner view is locked or has no draft (OD-023-2)", async () => {
    for (const view of [
      { ...exampleOwnerCaseView, editable: false },
      { ...exampleOwnerCaseView, draft: null },
    ]) {
      const html = await renderReport(view);
      expect(html).not.toContain("১৩২১৯-এ বলার জন্য সারাংশ");
      expect(html).not.toMatch(/<button[^>]*>১৩২১৯ সারাংশ<\/button>/);
    }
  });
});

describe("S-004 helpline card: API-006 request shape", () => {
  it("POSTs { type: 'helpline' } same-origin to /api/cases/<id>/outputs", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ ...exampleOutputResponse, type: "helpline" }), { status: 200 });
    };
    const out = await requestOutput(exampleOwnerCaseView.id, "helpline", { fetchImpl, online: () => true });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.data.type).toBe("helpline");
      expect(out.data.label_bn).toBe(OUTPUT_DRAFT_LABEL_BN);
    }
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`/api/cases/${exampleOwnerCaseView.id}/outputs`);
    expect(calls[0]!.init?.method).toBe("POST");
    expect(calls[0]!.init?.body).toBe(JSON.stringify({ type: "helpline" }));
    expect(calls[0]!.init?.credentials).toBe("same-origin");
    expect(calls[0]!.init?.cache).toBe("no-store");
  });
});

describe("S-004 helpline card: rendered Bangla summary", () => {
  // The card uses OutputText (lang="bn" pre, named by the helpline card's title) to
  // render the returned text_bn. The draft label must be visible (BR-002) and the
  // text must stay at most 80 words in the worst case (FR-010, TC-007).
  const TITLE_REGEX = /<h3[^>]*id="([^"]+)"[^>]*>[\s\S]*?১৩২১৯-এ বলার জন্য সারাংশ[\s\S]*?<\/h3>/;

  function renderReady(text_bn: string, labelledBy: string): { html: string; rendered: string } {
    const html = renderToStaticMarkup(
      createElement(OutputText, { text: text_bn, labelledBy, blockRef: null }),
    );
    // The rendered text is the text_bn with any Latin runs wrapped in <span lang="en">.
    // Strip tags for a faithful word count; the original text is unchanged (see
    // tests/ui/report-screen.test.ts "marks Latin runs" assertion).
    const rendered = html.replace(/<[^>]+>/g, "");
    return { html, rendered };
  }

  it("shows the draft label in the returned text, in Bangla, named by the helpline title", async () => {
    const html = await renderReport(exampleOwnerCaseView);
    // The report screen's helpline card has a heading whose id is what labels the
    // <pre> block once the card is ready. Find that id so the assertion below is the
    // same as what a real OutputCard would name the rendered text with.
    const match = TITLE_REGEX.exec(html);
    expect(match, "helpline card title not found in markup").not.toBeNull();
    const titleId = match![1]!;
    const response: OutputResponse = {
      type: "helpline",
      text_bn: TEMPLATES.helpline({
        refCode: exampleOwnerCaseView.ref_code,
        draft: exampleOwnerCaseView.draft!,
        districtNameBn: "ঢাকা",
      }),
      label_bn: OUTPUT_DRAFT_LABEL_BN,
      word_count: 0,
      generated_at: "2026-10-12T20:10:00+06:00",
    };
    response.word_count = countWords(response.text_bn);
    const { html: textHtml, rendered } = renderReady(response.text_bn, titleId);
    // The output text block is Bangla, named by the helpline title, and selectable.
    expect(textHtml).toMatch(new RegExp(`<pre[^>]*lang="bn"[^>]*aria-labelledby="${titleId}"`));
    expect(textHtml).toContain("select-text");
    // Draft label is visible in the rendered text (the schema's contract).
    expect(rendered).toContain(OUTPUT_DRAFT_LABEL_BN);
    // Worst-case word count holds for the example case.
    expect(countWords(rendered)).toBeLessThanOrEqual(80);
  });

  it("stays at most 80 words after rendering with every field at its maximum length (TC-007, FR-010)", () => {
    // Mirrors tests/outputs/templates.test.ts: word-dense values filling each field's
    // character limit, so the worst case counts words, not characters. The template
    // pin is 77 words; we assert <= 80 on the rendered text (tag-stripped) to prove
    // the constraint holds after the screen renders it.
    const dense = (n: number) => "ক ".repeat(Math.floor(n / 2)).trim();
    const text_bn = TEMPLATES.helpline({
      refCode: "M-7K2Q9A",
      draft: {
        ...exampleOwnerCaseView.draft!,
        child: {
          ...exampleOwnerCaseView.draft!.child,
          name: dense(80),
          age_years: null,
          age_min: 6,
          age_max: 8,
          height_cm: 150,
          clothing: dense(160),
          marks: dense(160),
        },
        event: {
          ...exampleOwnerCaseView.draft!.event,
          place_text: dense(160),
          district_text: dense(80),
          thana: dense(80),
          at: null,
          at_lower: "2026-10-11T17:30:00Z",
          at_upper: "2026-10-12T03:00:00+06:00",
        },
        reporter: { relation: dense(80), phone: "0".repeat(32) },
      },
      districtNameBn: dense(80),
    });
    const { rendered } = renderReady(text_bn, "any-id");
    expect(countWords(rendered)).toBeLessThanOrEqual(80);
    // The dense cut also appears in the rendered text, proving the cut marker is
    // a real part of what the user would read aloud.
    expect(rendered).toContain("… (সংক্ষেপিত)");
  });
});
