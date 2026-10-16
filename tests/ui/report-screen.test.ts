// TASK-024: SCREEN-004 markup, server-rendered in Node (no browser here). Reference card,
// COMP-033 badge (icon + text + colour), the three output cards with the draft label,
// tel:13219, the locked state (OD-023-2), parent-surface rules (no red, 44 px, ≥ 3:1
// control borders) and TC-006's "no image input exists". The PNG itself needs a browser
// (Playwright, TASK-038).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnerCaseView } from "@/contracts";
import { exampleOwnerCaseView } from "@/contracts/examples";

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
const { StatusBadge } = await import("@/app/components/status-badge");

async function render(view: OwnerCaseView, locale?: "bn" | "en") {
  guard.view = view;
  localeCookie = locale;
  return renderToStaticMarkup(
    await ReportPage({ params: Promise.resolve({ id: view.id }) }),
  );
}

afterEach(() => {
  guard.calls = [];
  localeCookie = undefined;
});

const RED = /danger|\bred-|text-red|bg-red|#ff0000|crimson/i;

describe("SCREEN-004", () => {
  it("reads the parent's own report through requireOwnCase", async () => {
    await render(exampleOwnerCaseView);
    expect(guard.calls).toEqual([
      [exampleOwnerCaseView.id, `/report/${exampleOwnerCaseView.id}`],
    ]);
  });

  it("shows the reference large and in Latin mono, with the status badge and matching line", async () => {
    const html = await render(exampleOwnerCaseView);
    expect(html).toContain('data-surface="parent"');
    expect(html).toMatch(
      new RegExp(
        `lang="en" translate="no" class="font-mono[^"]*">${exampleOwnerCaseView.ref_code}<`,
      ),
    );
    expect(html).toMatch(
      /<span class="[^"]*bg-info-soft text-info-text"><span class="sr-only">অবস্থা: <\/span><svg[^>]*>(?:(?!<\/span>).)*<\/svg>খোলা<\/span>/,
    );
    expect(html).toContain("মিল খোঁজা হয়েছে");
    expect(html).toContain("ফেরা পুলিশে জিডি জমা দেয় না।");
  });

  it("has the three output cards, each with the draft label and its D3 action, and no draft data", async () => {
    const html = await render(exampleOwnerCaseView);
    expect(html.match(/খসড়া — নিজে জমা দিন/g)).toHaveLength(3);
    for (const action of ["জিডি খসড়া", "পোস্টার", "১৩২১৯ সারাংশ"])
      expect(html).toMatch(new RegExp(`<button[^>]*>${action}</button>`));
    const draft = exampleOwnerCaseView.draft!;
    for (const value of [
      draft.child.name!,
      draft.child.clothing!,
      draft.event.place_text!,
      "01700000001",
      "০১৭০০০০০০০১",
    ])
      expect(html).not.toContain(value);
  });

  it("renders English when chosen", async () => {
    const html = await render(exampleOwnerCaseView, "en");
    expect(html).toContain("Report submitted");
    expect(html).toContain("Draft — submit it yourself");
    expect(html).toMatch(/<button[^>]*>GD draft<\/button>/);
  });

  it("keeps the 13219 call link, ≥ 44 px with a ≥ 3:1 border", async () => {
    const html = await render(exampleOwnerCaseView);
    expect(html).toMatch(
      /<a href="tel:13219" class="[^"]*min-h-12[^"]*border-control /,
    );
  });

  it("hides the outputs when the report is locked or has no draft (OD-023-2)", async () => {
    for (const view of [
      { ...exampleOwnerCaseView, editable: false },
      { ...exampleOwnerCaseView, draft: null },
    ]) {
      const html = await render(view);
      expect(html).not.toContain("<button");
      expect(html).toContain("এই রিপোর্টের খসড়া আর দেখানো যাবে না");
      expect(html).toContain('href="tel:13219"');
    }
  });

  it("has no red and no target under 44 px on the parent surface", async () => {
    const html = await render(exampleOwnerCaseView);
    expect(html).not.toMatch(RED);
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(b).toMatch(/min-h-1[12]/);
  });
});

describe("output text", () => {
  it("marks Latin runs inside Bangla text as English without changing the text", async () => {
    const { OutputText } = await import("@/app/(parent)/report/[id]/ui");
    const text = "জেলা: [MOCK] জেলা ২৬\nরেফারেন্স: M-7K2Q9A";
    const html = renderToStaticMarkup(
      createElement(OutputText, { text, labelledBy: "h", blockRef: null }),
    );
    expect(html).toContain('<span lang="en" translate="no">[MOCK]</span>');
    expect(html).toContain('<span lang="en" translate="no">M-7K2Q9A</span>');
    expect(html.replace(/<[^>]+>/g, "")).toBe(text);
    expect(html).toMatch(
      /^<pre[^>]*lang="bn"[^>]*role="group"[^>]*aria-labelledby="h"/,
    );
  });
});

describe("COMP-033 status badge", () => {
  it.each([
    ["open", "খোলা"],
    ["matched", "যাচাই চলছে"],
    ["closed", "বন্ধ"],
  ] as const)("%s → icon + %s", (group, label) => {
    const html = renderToStaticMarkup(
      createElement(StatusBadge, { group, locale: "bn" }),
    );
    expect(html).toMatch(
      new RegExp(
        `<span class="sr-only">অবস্থা: </span><svg[^>]*>(?:(?!</span>).)*</svg>${label}</span>$`,
      ),
    );
    expect(html).not.toMatch(RED);
  });
});

describe("parent-screen sources", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
    );
  const sources = [
    ...files("src/app/(parent)"),
    "src/lib/poster.ts",
    "src/lib/poster-render.ts",
    "src/lib/outputs-client.ts",
  ];

  // TC-006 / BR-006: no way to take, pick or draw a photo.
  it.each(sources)(
    "%s has no file/camera input, image element or image drawing",
    (path) => {
      const src = readFileSync(path, "utf8");
      expect(src).not.toMatch(
        /type=["']file["']|accept=["']image|capture=|drawImage|createImageBitmap|putImageData|new Image\(|<img\b|<Image\b|next\/image|FileReader|getUserMedia/,
      );
    },
  );

  it.each(sources)(
    "%s uses no red and keeps control borders at border-control",
    (path) => {
      const src = readFileSync(path, "utf8");
      expect(src).not.toMatch(RED);
      for (const button of src.match(/BUTTON_SECONDARY = \[[^\]]*\]/g) ?? [])
        expect(button).toContain("border-control");
    },
  );
});
