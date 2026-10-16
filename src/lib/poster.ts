// COMP-031 poster helpers (TASK-024; FR-009, BR-006, BR-022, TC-006). Pure: no DOM and no
// server modules, so they are unit-tested in Node; the client component supplies a real
// canvas context.
//
// - posterShareText: the parent's contact choice (OD-023-1). The API-006 poster always
//   carries the reporter phone on one fixed line; declining removes that line here. The
//   result is blocked when a Bangladeshi mobile number is still in the text, also when
//   it is written with spaces, hyphens, dots or a +880 prefix (a number typed into a
//   free-text field). This is a safety net, not a guarantee: the parent reviews the text.
// - layoutPoster / paintPoster: a text-only 1080 × 1350 PNG with the draft label at the
//   top and a draft footer (D4). The context type has no image-drawing method, so a
//   photo cannot be drawn (BR-006: no image input exists). Bangla shaping is the
//   browser's. Text that does not fit even at the smallest size, or a single unbreakable
//   cluster wider than the page, is "too-long": nothing is cut silently.

// The fixed contact line of the API-006 poster template (src/server/outputs/templates.ts).
export const POSTER_CONTACT_PREFIX_BN = "তথ্য থাকলে যোগাযোগ করুন: ";
export const POSTER_FOOTER_BN = "খসড়া — নিজে জমা দিন";

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
// Separators people put inside phone numbers, plus invisible format characters.
const SEPARATORS = /([0-9])[\s\-–—.() ­​-‍⁠﻿]+(?=[0-9])/gu;
// After normalising: an 11-digit 01… mobile, the same with 880 / +880, or any 10+ digit run.
const PHONE_LIKE = /(?:\+?880)?01[3-9][0-9]{8}|[0-9]{10,}/u;

// Bangla → Latin digits, compatibility forms folded, separators between digits removed.
export function normaliseDigits(text: string): string {
  const latin = Array.from(text.normalize("NFKC"), (ch) => {
    const i = BN_DIGITS.indexOf(ch);
    return i >= 0 ? String(i) : ch;
  }).join("");
  let out = latin;
  for (let prev = ""; prev !== out;) {
    prev = out;
    out = out.replace(SEPARATORS, "$1");
  }
  return out;
}

export const hasPhoneNumber = (text: string): boolean =>
  PHONE_LIKE.test(normaliseDigits(text));

export type ShareText =
  { kind: "ok"; text: string } | { kind: "blocked"; text: string };

export function posterShareText(
  text: string,
  includeContact: boolean,
): ShareText {
  if (includeContact) return { kind: "ok", text };
  const out = text
    .split("\n")
    .filter((line) => !line.startsWith(POSTER_CONTACT_PREFIX_BN))
    .join("\n");
  return hasPhoneNumber(out)
    ? { kind: "blocked", text: out }
    : { kind: "ok", text: out };
}

/* ---------- layout ---------- */

export const POSTER = { width: 1080, height: 1350, margin: 72 } as const;
const MAX_BODY_PX = 40;
const MIN_BODY_PX = 24;

export type LineRole = "label" | "heading" | "lead" | "body" | "strong" | "gap";
export type PosterLine = { role: LineRole; text: string };

const HEADING_BN = "নিখোঁজ শিশু";
const HELPLINE_PREFIX_BN = "জরুরি হলে ";

// Roles from the template's fixed lines; everything else is a body line.
export function posterLines(text: string): PosterLine[] {
  const lines = text.split("\n");
  return lines.map((raw, i): PosterLine => {
    const line = raw.trim();
    if (line === "") return { role: "gap", text: "" };
    if (i === 0) return { role: "label", text: line };
    if (line === HEADING_BN) return { role: "heading", text: line };
    if (lines[i - 1]?.trim() === HEADING_BN)
      return { role: "lead", text: line };
    if (line.startsWith(HELPLINE_PREFIX_BN))
      return { role: "strong", text: line };
    return { role: "body", text: line };
  });
}

type Style = { px: number; weight: 400 | 600; lineHeight: number };

function styleFor(role: LineRole | "footer", body: number): Style {
  switch (role) {
    case "label":
    case "footer":
      return { px: Math.round(body * 0.7), weight: 600, lineHeight: 1.6 };
    case "heading":
      return { px: Math.round(body * 2), weight: 600, lineHeight: 1.4 };
    case "lead":
      return { px: Math.round(body * 1.2), weight: 600, lineHeight: 1.6 };
    case "strong":
      return { px: body, weight: 600, lineHeight: 1.7 };
    default:
      return { px: body, weight: 400, lineHeight: 1.7 };
  }
}

export type Measure = (text: string, font: string) => number;
export type DrawText = {
  kind: "text";
  text: string;
  x: number;
  y: number;
  font: string;
  color: string;
};
export type DrawRect = {
  kind: "label-box";
  x: number;
  y: number;
  w: number;
  h: number;
};
export type DrawOp = DrawText | DrawRect;
export type PosterLayout =
  { kind: "ok"; ops: DrawOp[]; bodyPx: number } | { kind: "too-long" };

export const fontFor = (px: number, weight: number, family: string): string =>
  `${weight} ${px}px ${family}`;

const VIRAMA = "্";
const JOINERS = /^[‌‍]+$/u;

// Grapheme clusters, with a cluster that ends in a hasanta (optionally plus ZWNJ/ZWJ)
// glued to the next one. Unicode 15.1 engines already keep conjuncts together; older
// ones (and the no-Segmenter fallback) would otherwise split ক্ষ into ক্ + ষ.
export function graphemes(s: string): string[] {
  const raw =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? Array.from(
          new Intl.Segmenter("bn", { granularity: "grapheme" }).segment(s),
          (g) => g.segment,
        )
      : (s.match(/\P{M}\p{M}*|\p{M}+/gu) ?? []);
  const out: string[] = [];
  for (const g of raw) {
    const last = out[out.length - 1];
    if (
      last !== undefined &&
      (last.replace(/[‌‍]+$/u, "").endsWith(VIRAMA) || JOINERS.test(g))
    )
      out[out.length - 1] = last + g;
    else out.push(g);
  }
  return out;
}

// Wraps on spaces; a single word wider than the line is split between graphemes, so a
// conjunct or a vowel sign is never separated from its consonant. A row can still be
// wider than maxWidth when one cluster alone is; the layout then reports too-long.
export function wrapText(
  text: string,
  maxWidth: number,
  font: string,
  measure: Measure,
): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/u).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, font) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) out.push(line);
    line = "";
    if (measure(word, font) <= maxWidth) {
      line = word;
      continue;
    }
    let piece = "";
    for (const g of graphemes(word)) {
      if (piece && measure(piece + g, font) > maxWidth) {
        out.push(piece);
        piece = "";
      }
      piece += g;
    }
    line = piece;
  }
  if (line) out.push(line);
  return out;
}

const INK = "#1a1a1a";
const MUTE = "#4a4a4a";

function layoutAt(
  lines: PosterLine[],
  body: number,
  family: string,
  measure: Measure,
): DrawOp[] | null {
  const { width, height, margin } = POSTER;
  const maxWidth = width - margin * 2;
  const footer = styleFor("footer", body);
  const footerFont = fontFor(footer.px, footer.weight, family);
  const footerTop = height - margin - Math.round(footer.px * footer.lineHeight);
  const fits = (row: string, font: string, room: number) => {
    const w = measure(row, font);
    return Number.isFinite(w) && w <= room;
  };
  if (!fits(POSTER_FOOTER_BN, footerFont, maxWidth)) return null;

  const ops: DrawOp[] = [];
  let y = margin;
  for (const line of lines) {
    if (line.role === "gap") {
      y += Math.round(body * 0.8);
      continue;
    }
    const s = styleFor(line.role, body);
    const font = fontFor(s.px, s.weight, family);
    const step = Math.round(s.px * s.lineHeight);
    const pad = line.role === "label" ? Math.round(s.px * 0.6) : 0;
    const room = maxWidth - pad * 2;
    const rows = wrapText(line.text, room, font, measure);
    if (!rows.every((r) => fits(r, font, room))) return null;
    if (line.role === "label") {
      const w = Math.min(
        maxWidth,
        Math.max(0, ...rows.map((r) => measure(r, font))) + pad * 2,
      );
      ops.push({
        kind: "label-box",
        x: margin,
        y,
        w,
        h: rows.length * step + pad,
      });
      y += Math.round(pad / 2);
    }
    for (const row of rows) {
      ops.push({
        kind: "text",
        text: row,
        x: margin + pad,
        y,
        font,
        color: line.role === "label" ? MUTE : INK,
      });
      y += step;
    }
    if (line.role === "label")
      y += Math.round(pad / 2) + Math.round(body * 0.6);
  }
  // The body must end above the footer, with a gap.
  if (y > footerTop - Math.round(body * 0.6)) return null;
  ops.push({
    kind: "text",
    text: POSTER_FOOTER_BN,
    x: margin,
    y: footerTop,
    font: footerFont,
    color: MUTE,
  });
  return ops;
}

// Largest body size from 40 px down to 24 px that fits the page.
export function layoutPoster(
  text: string,
  family: string,
  measure: Measure,
): PosterLayout {
  const lines = posterLines(text);
  for (let body = MAX_BODY_PX; body >= MIN_BODY_PX; body -= 2) {
    const ops = layoutAt(lines, body, family, measure);
    if (ops) return { kind: "ok", ops, bodyPx: body };
  }
  return { kind: "too-long" };
}

/* ---------- paint ---------- */

// The subset of CanvasRenderingContext2D the poster uses: text and rectangles only.
export type PosterCtx = Pick<
  CanvasRenderingContext2D,
  | "font"
  | "fillStyle"
  | "strokeStyle"
  | "lineWidth"
  | "textBaseline"
  | "fillRect"
  | "strokeRect"
  | "setLineDash"
  | "fillText"
>;

// White background regardless of UI theme (D4: export stays light and readable).
export function paintPoster(
  ctx: PosterCtx,
  layout: Extract<PosterLayout, { kind: "ok" }>,
): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, POSTER.width, POSTER.height);
  ctx.textBaseline = "top";
  for (const op of layout.ops) {
    if (op.kind === "label-box") {
      ctx.strokeStyle = MUTE;
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(op.x, op.y, op.w, op.h);
      ctx.setLineDash([]);
      continue;
    }
    ctx.font = op.font;
    ctx.fillStyle = op.color;
    ctx.fillText(op.text, op.x, op.y);
  }
}

// "M-7K3Q2A" → "fera-poster-M-7K3Q2A-draft.png" (no child data in the file name).
export const posterFileName = (refCode: string): string =>
  `fera-poster-${refCode.replace(/[^A-Za-z0-9-]/g, "")}-draft.png`;
