"use client";

// COMP-031 poster preview + PNG download (SCREEN-004 ACT-010/012/013; FR-009, BR-006,
// BR-022, TC-006; D2A API-006 "contact inclusion chosen in separate share preview").
//
// Steps: tap "পোস্টার" (API-006) → read the text → choose whether the phone number stays
// (no default) → tick the acknowledgement (D4 §15.1 poster share line) → make the image →
// download the PNG or copy the text.
//
// - The contact choice is applied client-side (OD-023-1): posterShareText removes the
//   fixed contact line and fails closed if a phone number is still in the text.
// - The image is drawn on a canvas from text only (no image input, no image drawing) after
//   Noto Sans Bengali has loaded; if it cannot load in 5 s, no image is made (no tofu).
// - The canvas is a visual of the text shown beside it (D4: poster PNG has a text
//   equivalent). Its object URL is revoked when the choice changes or on unmount.
import { useEffect, useId, useRef, useState } from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  LoaderCircleIcon,
} from "@/app/components/icons";
import {
  layoutPoster,
  paintPoster,
  POSTER,
  posterFileName,
  posterShareText,
  type PosterCtx,
} from "@/lib/poster";
import { locales, type Locale } from "@/locales";
import { copyText } from "./copy";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CardShell,
  FailureBox,
  OutputText,
  useOutput,
} from "./output-card";

type Choice = "include" | "omit" | null;
type Image =
  | { status: "none" }
  | { status: "rendering" }
  | { status: "ready"; url: string }
  | { status: "font" | "too-long" | "blocked" | "failed" };

const FONT_TIMEOUT_MS = 5_000;
const BN_SAMPLE = "অআক্ষ০১২";

function cssFamily(variable: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
}

// Loads the Bangla subset (unicode-range) in both weights, then checks it really loaded.
async function bengaliFamily(): Promise<string | null> {
  const bn = cssFamily("--font-noto-bengali");
  const latin = cssFamily("--font-inter");
  if (!bn) return null;
  const first = bn.split(",")[0]!.trim();
  const load = Promise.all([
    document.fonts.load(`400 40px ${first}`, BN_SAMPLE),
    document.fonts.load(`600 40px ${first}`, BN_SAMPLE),
  ]);
  const timeout = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), FONT_TIMEOUT_MS),
  );
  try {
    if ((await Promise.race([load, timeout])) === "timeout") return null;
    await document.fonts.ready;
  } catch {
    return null;
  }
  if (!document.fonts.check(`400 40px ${first}`, BN_SAMPLE)) return null;
  return [bn, latin, "sans-serif"].filter(Boolean).join(", ");
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export function PosterShare({
  caseId,
  refCode,
  locale,
}: {
  caseId: string;
  refCode: string;
  locale: Locale;
}) {
  const t = locales[locale];
  const uid = useId();
  const { state, dispatch, load } = useOutput(caseId, "poster");
  const [choice, setChoice] = useState<Choice>(null);
  const [ack, setAck] = useState(false);
  const [needChoice, setNeedChoice] = useState(0);
  const [image, setImage] = useState<Image>({ status: "none" });
  const [copyResult, setCopyResult] = useState<"copied" | "manual" | null>(
    null,
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blockRef = useRef<HTMLPreElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<string | null>(null);

  const revoke = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  };
  useEffect(() => revoke, []);

  const share =
    state.status === "ready" && choice
      ? posterShareText(state.output.text_bn, choice === "include")
      : null;
  const shownText =
    share?.kind === "ok"
      ? share.text
      : state.status === "ready"
        ? state.output.text_bn
        : "";

  function choose(next: Choice) {
    setChoice(next);
    setCopyResult(null);
    revoke();
    setImage({ status: "none" });
  }

  async function makeImage() {
    if (!choice || !ack) {
      setNeedChoice((n) => n + 1);
      firstRadioRef.current?.focus();
      return;
    }
    if (!share || share.kind === "blocked") {
      setImage({ status: "blocked" });
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      setImage({ status: "failed" });
      return;
    }
    revoke();
    setImage({ status: "rendering" });
    const family = await bengaliFamily();
    if (!family) {
      setImage({ status: "font" });
      return;
    }
    const layout = layoutPoster(share.text, family, (text, font) => {
      ctx.font = font;
      return ctx.measureText(text).width;
    });
    if (layout.kind === "too-long") {
      setImage({ status: "too-long" });
      return;
    }
    paintPoster(ctx as unknown as PosterCtx, layout);
    const blob = await toBlob(canvas);
    if (!blob) {
      setImage({ status: "failed" });
      return;
    }
    urlRef.current = URL.createObjectURL(blob);
    setImage({ status: "ready", url: urlRef.current });
  }

  async function onCopy() {
    setCopyResult(await copyText(shownText, blockRef.current));
    dispatch({ type: "copied" });
  }

  const imageMessage =
    image.status === "font"
      ? t.posterFontError
      : image.status === "too-long"
        ? t.posterTooLong
        : image.status === "blocked"
          ? t.posterBlocked
          : image.status === "failed"
            ? t.posterFontError
            : null;

  return (
    <CardShell type="poster" locale={locale} titleId={`${uid}-title`}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {state.status === "loading" && (
          <p className="flex items-center gap-2 text-body-md text-body">
            <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
            <span>{t.outputPreparing}</span>
          </p>
        )}
        {image.status === "rendering" && (
          <p className="flex items-center gap-2 text-body-md text-body">
            <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
            <span>{t.posterRendering}</span>
          </p>
        )}
        {image.status === "ready" && <p className="sr-only">{t.posterReady}</p>}
        {copyResult && state.status === "ready" && (
          <p
            key={state.copies}
            className="flex items-center gap-2 text-body-md text-body"
          >
            <CircleCheckIcon className="size-4 text-success" />
            <span>{copyResult === "copied" ? t.copied : t.copyManual}</span>
          </p>
        )}
      </div>

      {(state.status === "idle" || state.status === "loading") && (
        <button
          type="button"
          onClick={load}
          aria-disabled={state.status === "loading" || undefined}
          className={`${BUTTON_PRIMARY} self-start`}
        >
          {t.outputPoster}
        </button>
      )}
      {state.status === "failed" && (
        <FailureBox failure={state.failure} locale={locale} onRetry={load} />
      )}

      {state.status === "ready" && (
        <>
          <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2.5 text-body-md text-info-text">
            <InfoIcon className="mt-[0.35em] size-4" />
            <span>{t.posterShareNotice}</span>
          </p>

          <h4
            id={`${uid}-text`}
            className="text-body-md font-semibold text-ink"
          >
            {t.posterTextHeading}
          </h4>
          <div aria-labelledby={`${uid}-text`} role="region">
            <OutputText text={shownText} blockRef={blockRef} />
          </div>

          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={needChoice ? `${uid}-need` : undefined}
          >
            <legend className="mb-1 text-body-md font-medium text-ink">
              {t.posterContactLegend}
            </legend>
            {(["include", "omit"] as const).map((value, i) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-control px-3 py-2 has-checked:border-control-strong has-checked:bg-selected"
              >
                <input
                  ref={i === 0 ? firstRadioRef : undefined}
                  type="radio"
                  name={`${uid}-contact`}
                  value={value}
                  checked={choice === value}
                  onChange={() => choose(value)}
                  className="size-5 accent-(--color-primary)"
                />
                <span className="text-body-md text-ink">
                  {value === "include"
                    ? t.posterContactInclude
                    : t.posterContactOmit}
                </span>
              </label>
            ))}
          </fieldset>

          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-control px-3 py-2.5 has-checked:border-control-strong">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => {
                setAck(e.currentTarget.checked);
                if (!e.currentTarget.checked) choose(choice);
              }}
              className="mt-[0.3em] size-5 shrink-0 accent-(--color-primary)"
            />
            <span className="text-body-md text-ink">{t.posterAckLabel}</span>
          </label>

          <div role="alert" aria-atomic="true">
            {needChoice > 0 && (!choice || !ack) && (
              <p
                key={needChoice}
                id={`${uid}-need`}
                className="flex items-start gap-2 text-body-md text-ink"
              >
                <CircleAlertIcon className="mt-[0.35em] size-4 text-mute" />
                <span>{t.posterChooseFirst}</span>
              </p>
            )}
            {imageMessage && (
              <p className="flex items-start gap-2 rounded-md border border-hairline-strong bg-card px-3 py-2.5 text-body-md text-ink">
                <CircleAlertIcon className="mt-[0.35em] size-4 text-mute" />
                <span>{imageMessage}</span>
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {image.status !== "ready" && (
              <button
                type="button"
                onClick={makeImage}
                aria-disabled={image.status === "rendering" || undefined}
                className={BUTTON_PRIMARY}
              >
                {t.posterMake}
              </button>
            )}
            {image.status === "ready" && (
              <a
                href={image.url}
                download={posterFileName(refCode)}
                className={BUTTON_PRIMARY}
              >
                <DownloadIcon />
                <span>{t.posterDownload}</span>
              </a>
            )}
            {choice && ack && share?.kind === "ok" && (
              <button
                type="button"
                onClick={onCopy}
                className={BUTTON_SECONDARY}
              >
                <CopyIcon />
                <span>{t.posterCopyText}</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Always mounted so the context exists when the parent makes the image. */}
      <canvas
        ref={canvasRef}
        width={POSTER.width}
        height={POSTER.height}
        role="img"
        aria-label={t.posterImageLabel}
        hidden={image.status !== "ready"}
        className="h-auto w-full max-w-[24rem] rounded-md border border-hairline"
      />
    </CardShell>
  );
}
