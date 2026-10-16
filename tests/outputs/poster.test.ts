// TASK-024 / TC-006: poster share text (OD-023-1 contact choice), layout, paint and the
// render run. The canvas is faked: measure is "0.55 em per character", paint records.
import { describe, expect, it } from "vitest";
import { REFS, exampleMissingDraft } from "@/contracts/examples";
import {
  POSTER,
  POSTER_CONTACT_PREFIX_BN,
  POSTER_FOOTER_BN,
  fontFor,
  graphemes,
  hasPhoneNumber,
  layoutPoster,
  paintPoster,
  posterFileName,
  posterLines,
  posterShareText,
  wrapText,
  type Measure,
  type PosterCtx,
} from "@/lib/poster";
import { renderPoster, type PosterRenderDeps } from "@/lib/poster-render";
import { renderOutput } from "@/server/outputs";

const PHONE_BN = "০১৭০০০০০০০১";
const poster = renderOutput("poster", {
  refCode: REFS.missing,
  draft: exampleMissingDraft,
  districtNameBn: "ঢাকা",
});

const sizeOf = (font: string) => Number(/(\d+)px/.exec(font)?.[1] ?? 0);
const measure: Measure = (text, font) =>
  Array.from(text).length * sizeOf(font) * 0.55;
const texts = (layout: ReturnType<typeof layoutPoster>) =>
  layout.kind === "ok"
    ? layout.ops.flatMap((o) => (o.kind === "text" ? [o.text] : []))
    : [];

describe("the API-006 poster template (pinned for the contact choice)", () => {
  it("has exactly one contact line, and the phone appears only there", () => {
    const lines = poster.split("\n");
    const contact = lines.filter((l) => l.startsWith(POSTER_CONTACT_PREFIX_BN));
    expect(contact).toEqual([`${POSTER_CONTACT_PREFIX_BN}${PHONE_BN}`]);
    expect(lines.filter((l) => l.includes(PHONE_BN))).toEqual(contact);
    expect(poster).toContain("১৩২১৯");
    expect(poster).toContain("খসড়া");
  });
});

describe("posterShareText", () => {
  it("keeps the text unchanged when the parent includes the number", () => {
    expect(posterShareText(poster, true)).toEqual({ kind: "ok", text: poster });
  });

  it("drops only the contact line when the parent declines; 13219 stays", () => {
    const r = posterShareText(poster, false);
    expect(r.kind).toBe("ok");
    expect(r.text).not.toContain(PHONE_BN);
    expect(r.text).not.toContain(POSTER_CONTACT_PREFIX_BN);
    expect(r.text).toContain("জরুরি হলে ১৩২১৯-এ কল করুন।");
    expect(r.text.split("\n")).toHaveLength(poster.split("\n").length - 1);
  });

  it.each([
    `শিশুর নাম: ${PHONE_BN}`,
    "নোট: 01700000001",
    "০1৭00000001",
    "চিহ্ন: ০১৭১২-৩৪৫৬৭৮",
    "চিহ্ন: ০১৭১২ ৩৪৫ ৬৭৮",
    "01711 123456",
    "017-1112-3456",
    "+৮৮০ ১৭১১ ১২৩৪৫৬",
    "+880 1711-123456",
    "০১৭১১.১২৩.৪৫৬",
    "০১৭১১‌১২৩৪৫৬",
    "０１７１１１２３４５６", // fullwidth
  ])("blocks the poster when a number is still in the text (%s)", (line) => {
    const r = posterShareText(`${poster}\n${line}`, false);
    expect(r.kind).toBe("blocked");
    expect(r.text).not.toContain(POSTER_CONTACT_PREFIX_BN); // the shown text never re-adds the contact line
  });

  it.each([
    "সময়: ১২ অক্টোবর ২০২৬, বিকেল ৩:০০",
    "উচ্চতা: ১২০ সেমি",
    "রেফারেন্স: M-7K2Q9A",
    "বয়স: ৬–৮ বছর",
    "১৩২১৯",
  ])("does not mistake ordinary numbers for a phone (%s)", (line) => {
    expect(hasPhoneNumber(line)).toBe(false);
  });
});

describe("posterLines", () => {
  it("gives the fixed template lines their roles", () => {
    const roles = posterLines(poster);
    expect(roles[0]).toMatchObject({ role: "label" });
    expect(roles.find((l) => l.text === "নিখোঁজ শিশু")?.role).toBe("heading");
    expect(roles.find((l) => l.text === "এই শিশুটিকে দেখেছেন?")?.role).toBe(
      "lead",
    );
    expect(roles.find((l) => l.text.startsWith("জরুরি হলে"))?.role).toBe(
      "strong",
    );
    expect(roles.some((l) => l.role === "gap")).toBe(true);
  });
});

describe("graphemes and wrapText", () => {
  it("wraps on spaces within the width", () => {
    const font = fontFor(10, 400, "x");
    const rows = wrapText("এক দুই তিন চার পাঁচ ছয়", 55, font, measure);
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(measure(r, font)).toBeLessThanOrEqual(55);
  });

  it("returns no rows for empty or blank text", () => {
    expect(wrapText("", 100, "x", measure)).toEqual([]);
    expect(wrapText("   \n ", 100, "x", measure)).toEqual([]);
  });

  it("keeps conjuncts and vowel signs whole when an over-long word is split", () => {
    const word = "ক্ষক্ষক্ষক্ষক্ষক্ষ";
    const rows = wrapText(word, 4 * 0.55 * 10, fontFor(10, 400, "x"), measure);
    expect(rows.join("")).toBe(word);
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows) expect(r).toMatch(/^(ক্ষ)+$/u);
  });

  it("glues a hasanta cluster to the next one even when the engine splits them", () => {
    // Pre-Unicode-15.1 engines segment ক্ষ as ["ক্", "ষ"]; the glue repairs it.
    expect(graphemes("ক্ষি")).toEqual(["ক্ষি"]);
    expect(graphemes("স্ত্রী")).toEqual(["স্ত্রী"]);
    expect(graphemes("র‍্যাব")).toEqual(["র‍্যা", "ব"]);
    for (const g of graphemes("শনাক্তকরণ টার্মিনাল সন্ধ্যা")) {
      expect(g.endsWith("্")).toBe(false);
      expect(/^\p{M}/u.test(g)).toBe(false);
    }
  });
});

describe("layoutPoster (TC-006: text + PNG with 13219 and phone)", () => {
  it("fits the template, every line inside the margins, with a draft footer at the bottom", () => {
    const layout = layoutPoster(poster, "Noto", measure);
    if (layout.kind !== "ok") throw new Error("expected a layout");
    expect(layout.bodyPx).toBe(36); // 38 before the footer took its line
    const drawn = texts(layout).join(" ");
    for (const part of ["১৩২১৯", PHONE_BN, "খসড়া", REFS.missing])
      expect(drawn).toContain(part);
    for (const op of layout.ops) {
      if (op.kind !== "text") continue;
      expect(op.y + sizeOf(op.font)).toBeLessThanOrEqual(
        POSTER.height - POSTER.margin,
      );
      expect(op.x + measure(op.text, op.font)).toBeLessThanOrEqual(
        POSTER.width - POSTER.margin,
      );
    }
    const last = layout.ops.at(-1);
    expect(last).toMatchObject({ kind: "text", text: POSTER_FOOTER_BN });
    const bodyBottom = Math.max(...layout.ops.slice(0, -1).map((o) => o.y));
    expect(last!.y).toBeGreaterThan(bodyBottom);
  });

  it("leaves the phone out of the image when the parent declined", () => {
    const r = posterShareText(poster, false);
    const drawn = texts(layoutPoster(r.text, "Noto", measure)).join(" ");
    expect(drawn).not.toContain(PHONE_BN);
    expect(drawn).toContain("১৩২১৯");
  });

  it("shrinks long text to fit, and reports too-long instead of cutting it", () => {
    const long = `${poster}\n${"পরনে ছিল লাল জামা ও নীল প্যান্ট ".repeat(8)}`;
    const shrunk = layoutPoster(long, "Noto", measure);
    expect(shrunk.kind).toBe("ok");
    if (shrunk.kind === "ok") expect(shrunk.bodyPx).toBeLessThan(36);
    expect(
      layoutPoster(
        `${poster}\n${"অনেক লম্বা লেখা ".repeat(600)}`,
        "Noto",
        measure,
      ),
    ).toEqual({ kind: "too-long" });
  });

  it("is too-long when one cluster alone is wider than the page or measuring fails", () => {
    const wide: Measure = (text, font) =>
      text.includes("ক্ষ") ? 5000 : measure(text, font);
    expect(layoutPoster(`${poster}\nক্ষ`, "Noto", wide)).toEqual({
      kind: "too-long",
    });
    expect(layoutPoster(poster, "Noto", () => Number.NaN)).toEqual({
      kind: "too-long",
    });
  });
});

describe("paintPoster", () => {
  it("paints a white page first, then exactly the laid-out text", () => {
    const calls: string[] = [];
    const ctx = {
      font: "",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      textBaseline: "alphabetic",
      fillRect: (x: number, y: number, w: number, h: number) =>
        calls.push(`fillRect ${x} ${y} ${w} ${h}`),
      strokeRect: () => calls.push("strokeRect"),
      setLineDash: () => undefined,
      fillText: (text: string) => calls.push(`fillText ${text}`),
    } as unknown as PosterCtx;
    const layout = layoutPoster(poster, "Noto", measure);
    if (layout.kind !== "ok") throw new Error("layout");
    paintPoster(ctx, layout);
    expect(calls[0]).toBe(`fillRect 0 0 ${POSTER.width} ${POSTER.height}`);
    expect(
      calls.filter((c) => c.startsWith("fillText")).map((c) => c.slice(9)),
    ).toEqual(texts(layout));
    expect(calls.filter((c) => c === "strokeRect")).toHaveLength(1); // the dashed draft label
  });
});

describe("renderPoster (stale runs never publish)", () => {
  function deps(overrides: Partial<PosterRenderDeps> = {}) {
    const created: string[] = [];
    const revoked: string[] = [];
    const d: PosterRenderDeps = {
      family: async () => "Noto",
      measure,
      paint: () => undefined,
      toBlob: async () => new Blob(["png"]),
      createUrl: () => {
        const url = `blob:${created.length}`;
        created.push(url);
        return url;
      },
      revokeUrl: (url) => revoked.push(url),
      ...overrides,
    };
    return { d, created, revoked };
  }
  const ok = posterShareText(poster, false);

  it("publishes a URL for a current run", async () => {
    const { d } = deps();
    expect(await renderPoster(ok, d, () => true)).toEqual({
      status: "ready",
      url: "blob:0",
    });
  });

  it("drops a run that went stale while the font loaded (choice changed, box unticked)", async () => {
    let current = true;
    const { d, created } = deps({
      family: async () => {
        current = false;
        return "Noto";
      },
    });
    expect(await renderPoster(ok, d, () => current)).toEqual({
      status: "stale",
    });
    expect(created).toEqual([]);
  });

  it("revokes the URL of a run that went stale after encoding", async () => {
    let current = true;
    const { d, revoked } = deps({
      createUrl: (blob) => {
        current = false;
        return `blob:${blob.size}`;
      },
    });
    expect(await renderPoster(ok, d, () => current)).toEqual({
      status: "stale",
    });
    expect(revoked).toEqual(["blob:3"]);
  });

  it("maps every failure to a state instead of throwing", async () => {
    expect(
      await renderPoster({ kind: "blocked", text: "x" }, deps().d, () => true),
    ).toEqual({ status: "blocked" });
    expect(
      await renderPoster(ok, deps({ family: async () => null }).d, () => true),
    ).toEqual({ status: "font" });
    expect(
      await renderPoster(ok, deps({ toBlob: async () => null }).d, () => true),
    ).toEqual({ status: "failed" });
    const boom = deps({
      paint: () => {
        throw new Error("canvas");
      },
    }).d;
    expect(await renderPoster(ok, boom, () => true)).toEqual({
      status: "failed",
    });
    expect(
      await renderPoster(ok, deps({ measure: () => Number.NaN }).d, () => true),
    ).toEqual({ status: "too-long" });
  });
});

it("names the file by reference only", () => {
  expect(posterFileName("M-7K2Q9A")).toBe("fera-poster-M-7K2Q9A-draft.png");
  expect(posterFileName("M-7K/../x")).toBe("fera-poster-M-7Kx-draft.png");
});
