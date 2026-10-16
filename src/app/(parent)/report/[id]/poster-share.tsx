"use client";

// COMP-031 poster preview + PNG download (SCREEN-004 ACT-010/012/013; FR-009, BR-006,
// BR-022, TC-006; D2A API-006 "contact inclusion chosen in separate share preview").
//
// Steps: tap "পোস্টার" (API-006) → read the text → choose whether the phone number stays
// (no default) → tick the acknowledgement (D4 §15.1 poster share line) → make the poster
// → download the PNG or copy the text.
//
// - The contact choice is applied client-side (OD-023-1): posterShareText removes the
//   fixed contact line and blocks the poster if a phone number is still in the text.
// - Each render is a numbered run (renderPoster). Changing the choice, unticking the
//   acknowledgement, starting another run or leaving the page makes the run stale, so
//   it never publishes a download that contradicts what the parent chose.
// - The PNG is drawn from text only after Noto Sans Bengali has loaded (no tofu); the
//   canvas preview is described by the poster text above it (D4 text equivalent).
// - Focus moves with the flow: to the text when it loads, to the first missing choice,
//   to the download link when the poster is ready, to the failure when one occurs.
import { useEffect, useId, useRef, useState } from "react";
import {
  CircleAlertIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  LoaderCircleIcon,
} from "@/app/components/icons";
import {
  paintPoster,
  POSTER,
  posterFileName,
  posterShareText,
} from "@/lib/poster";
import { renderPoster, type RenderOutcome } from "@/lib/poster-render";
import { locales, type Locale } from "@/locales";
import { copyText } from "./copy";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CardShell,
  FailureBox,
  OutputText,
} from "./ui";
import { useAnnouncer, useOutput } from "./use-output";

type Choice = "include" | "omit" | null;
type PosterState =
  | { status: "none" }
  | { status: "rendering" }
  | Exclude<RenderOutcome, { status: "stale" }>;

const FONT_TIMEOUT_MS = 5_000;
const BN_SAMPLE = "অআক্ষ০১২";

function cssFamily(variable: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
}

// Loads the Bangla subset (unicode-range) in both weights and the Latin face, and only
// accepts the Bangla family when a face really loaded (an unknown family loads nothing).
async function posterFamily(): Promise<string | null> {
  const bn = cssFamily("--font-noto-bengali");
  const latin = cssFamily("--font-inter");
  if (!bn || !("fonts" in document)) return null;
  const first = bn.split(",")[0]!.trim();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), FONT_TIMEOUT_MS);
  });
  try {
    const load = Promise.all([
      document.fonts.load(`400 40px ${first}`, BN_SAMPLE),
      document.fonts.load(`600 40px ${first}`, BN_SAMPLE),
      latin
        ? document.fonts.load(`400 40px ${latin.split(",")[0]!.trim()}`, "M-7K")
        : Promise.resolve([]),
    ]);
    const loaded = await Promise.race([load, timeout]);
    if (
      loaded === "timeout" ||
      loaded[0].length === 0 ||
      loaded[1].length === 0
    )
      return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  return [bn, latin, "sans-serif"].filter(Boolean).join(", ");
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
  const ids = {
    title: `${uid}-title`,
    text: `${uid}-text`,
    textBlock: `${uid}-text-block`,
    needChoice: `${uid}-need-choice`,
    needAck: `${uid}-need-ack`,
  };
  const { state, dispatch, load } = useOutput(caseId, "poster");
  const [choice, setChoice] = useState<Choice>(null);
  const [ack, setAck] = useState(false);
  const [tried, setTried] = useState(0);
  const [image, setImage] = useState<PosterState>({ status: "none" });
  const [message, announce] = useAnnouncer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blockRef = useRef<HTMLPreElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const firstRadioRef = useRef<HTMLInputElement>(null);
  const ackRef = useRef<HTMLInputElement>(null);
  const downloadRef = useRef<HTMLAnchorElement>(null);
  const urlRef = useRef<string | null>(null);
  const runRef = useRef(0);

  function reset() {
    runRef.current += 1;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    canvasRef.current
      ?.getContext("2d")
      ?.clearRect(0, 0, POSTER.width, POSTER.height);
    setImage({ status: "none" });
  }
  // Leaving the page cancels a run in flight and frees its URL.
  useEffect(
    () => () => {
      runRef.current += 1;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  useEffect(() => {
    if (state.status === "ready") {
      announce(t.outputReady);
      blockRef.current?.focus();
    } else if (state.status === "failed") {
      failureRef.current?.focus();
    }
  }, [state.status, announce, t.outputReady]);

  useEffect(() => {
    if (image.status === "ready") {
      announce(t.posterReady);
      downloadRef.current?.focus();
    }
  }, [image.status, announce, t.posterReady]);

  const share =
    state.status === "ready" && choice
      ? posterShareText(state.output.text_bn, choice === "include")
      : null;
  const shownText = share
    ? share.text
    : state.status === "ready"
      ? state.output.text_bn
      : "";
  const missingChoice = tried > 0 && !choice;
  const missingAck = tried > 0 && !ack;

  function choose(next: Choice) {
    reset();
    setChoice(next);
  }

  async function makeImage() {
    if (image.status === "rendering") return;
    if (!choice || !ack || !share) {
      setTried((n) => n + 1);
      (choice ? ackRef : firstRadioRef).current?.focus();
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    reset();
    const run = runRef.current;
    if (!canvas || !ctx) {
      setImage({ status: "failed" });
      return;
    }
    setImage({ status: "rendering" });
    const outcome = await renderPoster(
      share,
      {
        family: posterFamily,
        measure: (text, font) => {
          ctx.font = font;
          return ctx.measureText(text).width;
        },
        paint: (layout) => paintPoster(ctx, layout),
        toBlob: () =>
          new Promise((resolve) => canvas.toBlob(resolve, "image/png")),
        createUrl: (blob) => URL.createObjectURL(blob),
        revokeUrl: (url) => URL.revokeObjectURL(url),
      },
      () => runRef.current === run,
    );
    if (outcome.status === "stale") return;
    if (outcome.status === "ready") urlRef.current = outcome.url;
    setImage(outcome);
  }

  async function onCopy() {
    const result = await copyText(shownText, blockRef.current);
    dispatch({ type: "copied" });
    announce(result === "copied" ? t.copied : t.copyManual);
  }

  const imageMessage =
    image.status === "font"
      ? t.posterFontError
      : image.status === "too-long"
        ? t.posterTooLong
        : image.status === "blocked"
          ? t.posterBlocked
          : image.status === "failed"
            ? t.posterFailed
            : null;

  return (
    <CardShell type="poster" locale={locale} titleId={ids.title}>
      <div role="status" aria-live="polite" aria-atomic="true">
        {state.status === "loading" || image.status === "rendering" ? (
          <p className="flex items-center gap-2 text-body-md text-body">
            <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
            <span>
              {state.status === "loading"
                ? t.outputPreparing
                : t.posterRendering}
            </span>
          </p>
        ) : (
          message && <p className="text-body-md text-body">{message}</p>
        )}
      </div>
      <div role="alert" aria-atomic="true">
        {state.status === "failed" && (
          <FailureBox
            failure={state.failure}
            locale={locale}
            onRetry={load}
            focusRef={failureRef}
          />
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

      {state.status === "ready" && (
        <>
          <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2.5 text-body-md text-info-text">
            <InfoIcon className="mt-[0.35em] size-4" />
            <span>{t.posterShareNotice}</span>
          </p>

          <h4 id={ids.text} className="text-body-md font-semibold text-ink">
            {t.posterTextHeading}
          </h4>
          <OutputText
            text={shownText}
            labelledBy={ids.text}
            id={ids.textBlock}
            blockRef={blockRef}
          />

          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={missingChoice ? ids.needChoice : undefined}
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
                  required
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
            {missingChoice && (
              <p
                id={ids.needChoice}
                className="flex items-start gap-2 text-body-md text-ink"
              >
                <CircleAlertIcon className="mt-[0.35em] size-4 text-mute" />
                <span>{t.posterNeedChoice}</span>
              </p>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-control px-3 py-2.5 has-checked:border-control-strong">
              <input
                ref={ackRef}
                type="checkbox"
                checked={ack}
                required
                aria-invalid={missingAck || undefined}
                aria-describedby={missingAck ? ids.needAck : undefined}
                onChange={(e) => {
                  reset();
                  setAck(e.currentTarget.checked);
                }}
                className="mt-[0.3em] size-5 shrink-0 accent-(--color-primary)"
              />
              <span className="text-body-md text-ink">{t.posterAckLabel}</span>
            </label>
            {missingAck && (
              <p
                id={ids.needAck}
                className="flex items-start gap-2 text-body-md text-ink"
              >
                <CircleAlertIcon className="mt-[0.35em] size-4 text-mute" />
                <span>{t.posterNeedAck}</span>
              </p>
            )}
          </div>

          <div role="alert" aria-atomic="true">
            {imageMessage && (
              <p className="flex items-start gap-2 rounded-md border border-hairline-strong bg-card px-3 py-2.5 text-body-md text-ink">
                <CircleAlertIcon className="mt-[0.35em] size-4 text-mute" />
                <span>{imageMessage}</span>
              </p>
            )}
            {tried > 0 && (missingChoice || missingAck) && (
              <p key={tried} className="sr-only">
                {missingChoice ? t.posterNeedChoice : t.posterNeedAck}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {image.status === "ready" ? (
              <a
                ref={downloadRef}
                href={image.url}
                download={posterFileName(refCode)}
                className={BUTTON_PRIMARY}
              >
                <DownloadIcon />
                <span>{t.posterDownload}</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={makeImage}
                aria-disabled={image.status === "rendering" || undefined}
                className={BUTTON_PRIMARY}
              >
                {t.posterMake}
              </button>
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

      {/* Always mounted so the context exists when the parent makes the poster. */}
      <canvas
        ref={canvasRef}
        width={POSTER.width}
        height={POSTER.height}
        role="img"
        aria-label={t.posterImageLabel}
        aria-describedby={state.status === "ready" ? ids.textBlock : undefined}
        hidden={image.status !== "ready"}
        className="h-auto w-full max-w-[24rem] rounded-md border border-hairline"
      />
    </CardShell>
  );
}
