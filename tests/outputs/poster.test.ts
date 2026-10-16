// TASK-024 / TC-006: poster share text (OD-023-1 contact choice), layout and paint.
// The canvas is faked: measure is "0.55 em per character" and paint records calls.
import { describe, expect, it } from "vitest";
import { REFS, exampleMissingDraft } from "@/contracts/examples";
import {
  POSTER,
  POSTER_CONTACT_PREFIX_BN,
  fontFor,
  layoutPoster,
  paintPoster,
  posterFileName,
  posterLines,
  posterShareText,
  wrapText,
  type Measure,
  type PosterCtx,
} from "@/lib/poster";
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
    if (r.kind !== "ok") return;
    expect(r.text).not.toContain(PHONE_BN);
    expect(r.text).not.toContain(POSTER_CONTACT_PREFIX_BN);
    expect(r.text).toContain("জরুরি হলে ১৩২১৯-এ কল করুন।");
    expect(r.text.split("\n")).toHaveLength(poster.split("\n").length - 1);
  });

  it.each([`শিশুর নাম: ${PHONE_BN}`, "নোট: 01700000001", "০1৭00000001"])(
    "fails closed when a number is still in the text (%s)",
    (line) => {
      expect(posterShareText(`${poster}\n${line}`, false)).toEqual({
        kind: "blocked",
      });
    },
  );
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

describe("wrapText", () => {
  it("wraps on spaces within the width", () => {
    const rows = wrapText(
      "এক দুই তিন চার পাঁচ ছয়",
      10 * 0.55 * 10,
      fontFor(10, 400, "x"),
      measure,
    );
    expect(rows.length).toBeGreaterThan(1);
    for (const r of rows)
      expect(measure(r, fontFor(10, 400, "x"))).toBeLessThanOrEqual(55);
  });

  it("splits an over-long word between graphemes, never inside a conjunct", () => {
    const word = "ক্ষক্ষক্ষক্ষক্ষক্ষ"; // ক্ষ = ক + ্ + ষ
    const rows = wrapText(word, 4 * 0.55 * 10, fontFor(10, 400, "x"), measure);
    expect(rows.join("")).toBe(word);
    for (const r of rows) expect(r.startsWith("্")).toBe(false);
  });
});

describe("layoutPoster (TC-006: text + PNG with 13219 and phone)", () => {
  it("fits the template at the largest size with every line drawn", () => {
    const layout = layoutPoster(poster, "Noto", measure);
    expect(layout.kind).toBe("ok");
    if (layout.kind !== "ok") return;
    expect(layout.bodyPx).toBeLessThanOrEqual(40);
    const drawn = texts(layout).join(" ");
    expect(drawn).toContain("১৩২১৯");
    expect(drawn).toContain(PHONE_BN);
    expect(drawn).toContain("খসড়া");
    expect(drawn).toContain(REFS.missing);
    for (const op of layout.ops) {
      if (op.kind !== "text") continue;
      expect(op.y).toBeLessThanOrEqual(POSTER.height - POSTER.margin);
      expect(op.x + measure(op.text, op.font)).toBeLessThanOrEqual(
        POSTER.width - POSTER.margin + 1,
      );
    }
  });

  it("leaves the phone out of the image when the parent declined", () => {
    const r = posterShareText(poster, false);
    if (r.kind !== "ok") throw new Error("blocked");
    const drawn = texts(layoutPoster(r.text, "Noto", measure)).join(" ");
    expect(drawn).not.toContain(PHONE_BN);
    expect(drawn).toContain("১৩২১৯");
  });

  it("shrinks long text, and reports too-long instead of cutting it", () => {
    const long = `${poster}\n${"পরনে ছিল লাল জামা ও নীল প্যান্ট ".repeat(40)}`;
    const shrunk = layoutPoster(long, "Noto", measure);
    expect(shrunk.kind === "ok" ? shrunk.bodyPx : 0).toBeLessThan(40);
    expect(
      layoutPoster(
        `${poster}\n${"অনেক লম্বা লেখা ".repeat(600)}`,
        "Noto",
        measure,
      ),
    ).toEqual({ kind: "too-long" });
  });
});

describe("paintPoster", () => {
  it("paints a white page first, then text only", () => {
    const calls: string[] = [];
    const ctx: PosterCtx = {
      font: "",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      textBaseline: "alphabetic",
      fillRect: (x, y, w, h) => calls.push(`fillRect ${x} ${y} ${w} ${h}`),
      strokeRect: () => calls.push("strokeRect"),
      setLineDash: () => undefined,
      fillText: (text) => calls.push(`fillText ${text}`),
    };
    const layout = layoutPoster(poster, "Noto", measure);
    if (layout.kind !== "ok") throw new Error("layout");
    paintPoster(ctx, layout);
    expect(calls[0]).toBe(`fillRect 0 0 ${POSTER.width} ${POSTER.height}`);
    expect(calls.filter((c) => c.startsWith("fillText")).length).toBe(
      texts(layout).length,
    );
    expect("drawImage" in ctx).toBe(false);
  });
});

it("names the file by reference only", () => {
  expect(posterFileName("M-7K2Q9A")).toBe("fera-poster-M-7K2Q9A-draft.png");
  expect(posterFileName("M-7K/../x")).toBe("fera-poster-M-7Kx-draft.png");
});
