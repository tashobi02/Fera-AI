"use client";

// COMP-043 redaction panel (SCREEN-013 ACT-027 → API-016, all eligible). The state
// machine, copy and request live in src/lib/admin-tools.ts; this file wires them to the DOM.
//
// - Typed confirmation: the action runs only after "বেনামী" is typed (D3 accessibility
//   row). A mismatch marks the input aria-invalid, moves focus back to it and puts the
//   message in an always-mounted alert region, re-keyed per attempt so pressing Enter in
//   the field again is announced again. The word itself carries lang="bn" inside English
//   copy. The request always sends the contract constant, never the typed text.
// - Loading is progress text in a polite status region; success (with Bangla numerals in
//   Bangla mode) goes to the same region, failures to an always-mounted alert region.
// - The submit uses aria-disabled while busy (focus stays), plus a synchronous guard.
// - After any outcome the server count is refreshed (router.refresh): a failed batch may
//   still have redacted some cases. When nothing eligible remains the panel shows the D3
//   empty state, the success message stays and focus moves to the outcome region.
// - Honest copy (D4): pseudonymisation, what is kept, copies outside Fera not removed.
import { useRouter } from "next/navigation";
import {
  useId,
  useReducer,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  EraserIcon,
  InboxIcon,
  InfoIcon,
  LoaderCircleIcon,
} from "@/app/components/icons";
import {
  adminFailureText,
  countText,
  initialRedactionState,
  REDACTION_CONFIRMATION,
  redactionReducer,
  redactionSkippedText,
  redactionSuccessText,
  requestRedaction,
} from "@/lib/admin-tools";
import { locales, type Locale } from "@/locales";

// Bangla 13 px captions read too small with conjuncts; they step up to 14 px.
const CAPTION = "text-caption-md [&:lang(bn)]:text-body-sm";

// Copy with a {word} slot: the typed word is Bangla even inside English copy (WCAG 3.1.2).
function withWord(text: string): ReactNode {
  const [before, after = ""] = text.split("{word}");
  return (
    <>
      {before}
      <span lang="bn">{REDACTION_CONFIRMATION}</span>
      {after}
    </>
  );
}

export function RedactionForm({
  locale,
  eligible,
}: {
  locale: Locale;
  eligible: number | null;
}) {
  const t = locales[locale];
  const router = useRouter();
  const uid = useId();
  const id = {
    title: `${uid}-title`,
    input: `${uid}-confirm`,
    hint: `${uid}-hint`,
    error: `${uid}-error`,
    facts: `${uid}-facts`,
  };
  const [state, dispatch] = useReducer(redactionReducer, initialRedactionState);
  const inputRef = useRef<HTMLInputElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const busy = state.status === "submitting";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const value = inputRef.current?.value ?? "";
    const next = redactionReducer(state, { type: "submit", value });
    dispatch({ type: "submit", value });
    if (next.status !== "submitting") {
      inputRef.current?.focus();
      return;
    }
    inFlight.current = true;
    const outcome = await requestRedaction();
    inFlight.current = false;
    dispatch({ type: "outcome", outcome });
    if (outcome.kind === "ok") {
      if (inputRef.current) inputRef.current.value = "";
      // The form may unmount once the count reaches 0; keep focus on the outcome.
      outcomeRef.current?.focus();
    }
    router.refresh();
  }

  const success = state.result
    ? redactionSuccessText(state.result, locale)
    : null;
  const skipped = state.result
    ? redactionSkippedText(state.result, locale)
    : null;
  const failure = state.failure
    ? adminFailureText(state.failure, locale)
    : null;

  return (
    <section
      aria-labelledby={id.title}
      className="rounded-lg border border-hairline bg-surface"
    >
      <div className="flex flex-col gap-4 p-[16px] sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 items-center justify-center rounded-md bg-card text-mute"
          >
            <EraserIcon />
          </span>
          <h2 id={id.title} className="text-title font-semibold text-ink">
            {t.redactTitle}
          </h2>
        </div>

        {eligible !== null && (
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-md bg-card px-3 py-2.5">
            <span className="text-body-sm text-body">{t.redactEligible}</span>
            <span className="font-mono text-body-md font-medium tabular-nums text-ink [&:lang(bn)]:font-sans">
              {countText(eligible, locale)}
            </span>
          </p>
        )}

        <ul id={id.facts} className="flex flex-col gap-2">
          {[t.redactKeeps, t.redactExternal, t.redactEvidenceRule].map(
            (fact) => (
              <li
                key={fact}
                className="flex items-start gap-2 text-body-sm text-body"
              >
                <InfoIcon className="mt-[0.3em] size-4 text-info" />
                <span className="min-w-0 [overflow-wrap:anywhere]">{fact}</span>
              </li>
            ),
          )}
        </ul>
      </div>

      <div className="border-t border-hairline p-[16px] sm:p-6">
        {/* Always mounted: progress and success are announced politely, failures assertively. */}
        <div ref={outcomeRef} tabIndex={-1} className="outline-none">
          <div role="status" aria-live="polite" aria-atomic="true">
            {busy && (
              <p className="mb-4 flex items-start gap-2 text-body-sm text-body">
                <LoaderCircleIcon className="mt-[0.2em] size-4 animate-spin motion-reduce:animate-none" />
                <span>{t.redacting}</span>
              </p>
            )}
            {success && (
              <div className="mb-4 flex items-start gap-2 rounded-md bg-success-soft px-3 py-2.5 text-body-sm text-success-text">
                <CircleCheckIcon className="mt-[0.2em] size-4" />
                <p>
                  <span className="font-medium">{success}</span>
                  {skipped && (
                    <>
                      {" "}
                      <span className="block">{skipped}</span>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
          <div role="alert" aria-atomic="true">
            {failure && (
              <p className="mb-4 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-body-sm text-danger-text">
                <CircleAlertIcon className="mt-[0.2em] size-4" />
                <span>{failure}</span>
              </p>
            )}
          </div>
        </div>

        {eligible === null ? (
          <p className="flex items-start gap-2 text-body-sm text-mute">
            <CircleAlertIcon className="mt-[0.2em] size-4" />
            <span>{t.redactCountUnavailable}</span>
          </p>
        ) : eligible === 0 ? (
          <p className="flex items-center gap-3 text-body-md text-body">
            <InboxIcon className="size-5 text-faint" />
            <span>{t.redactEmpty}</span>
          </p>
        ) : (
          <form
            noValidate
            onSubmit={onSubmit}
            aria-labelledby={id.title}
            aria-describedby={id.facts}
            className="flex flex-col gap-1.5"
          >
            <label
              htmlFor={id.input}
              className="text-body-sm font-medium text-ink"
            >
              {withWord(t.redactConfirmLabel)}
            </label>
            <div className="flex flex-wrap gap-3">
              <input
                ref={inputRef}
                id={id.input}
                name="confirmation"
                type="text"
                lang="bn"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={20}
                aria-required="true"
                aria-invalid={state.confirmError || undefined}
                aria-describedby={[id.hint, state.confirmError && id.error]
                  .filter(Boolean)
                  .join(" ")}
                onInput={(e) =>
                  dispatch({ type: "input", value: e.currentTarget.value })
                }
                className={[
                  "min-h-11 min-w-[min(12rem,100%)] flex-1 rounded-md border border-control bg-elevated px-3 text-body-md text-ink",
                  "transition-colors duration-(--duration-fast) ease-out",
                  "hover:border-control-strong focus:border-control-strong focus:shadow-1 aria-invalid:border-danger",
                ].join(" ")}
              />
              <button
                type="submit"
                aria-disabled={busy || undefined}
                className={[
                  "inline-flex min-h-11 max-w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-danger-soft px-5 py-2 text-start [overflow-wrap:anywhere]",
                  "text-body-md font-medium text-danger-text",
                  "transition-[transform,background-color] duration-(--duration-fast) ease-out",
                  "hover:bg-danger-soft/80 active:scale-[0.97] aria-disabled:cursor-progress aria-disabled:active:scale-100",
                ].join(" ")}
              >
                {busy ? (
                  <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />
                ) : (
                  <EraserIcon />
                )}
                <span>{t.redactAction}</span>
              </button>
            </div>
            <p id={id.hint} className={`text-mute ${CAPTION}`}>
              {t.redactConfirmHint}
            </p>
            <div role="alert" aria-atomic="true">
              {state.confirmError && (
                <p
                  key={state.confirmAttempts}
                  id={id.error}
                  className={`flex items-start gap-1.5 text-danger-text ${CAPTION}`}
                >
                  <CircleAlertIcon className="mt-[0.2em] size-3.5" />
                  <span>{withWord(t.redactConfirmMismatch)}</span>
                </p>
              )}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
