"use client";

// COMP-039 close-case dialog (SCREEN-012 ACT-023, API-011; FR-018, BR-012; TC-010).
// The form is rendered only when the case status permits closure (open →
// resolved_outside_fera, confirmed → coordination_recorded; allowedCloseOutcome in
// src/contracts/states.ts). The page passes the exact allowed outcome in, so a stale UI
// state cannot pick a closed-only choice.
//
// - Two-step confirm (D4 honesty: "the action is destructive, never a single click"). Step
//   1 collects outcome + note; step 2 is the final close. A submit is only sent on step 2.
// - The typed note survives a stale-version (E-005) error so the officer does not lose
//   what they wrote; the page surfaces a reload prompt and shows the note in a read-only
//   box until the page is reloaded (D3 SCREEN-012 / SCREEN-016: no silent retry).
// - On success, the success line is the exact D3 copy: "সমন্বয়ের সিদ্ধান্ত ও রেফারেল
//   নথিভুক্ত (সিমুলেশন)" / "Coordination decision and referral recorded (simulation)".
//   A success means the case is now closed; the page itself stays put (a follow-up reload
//   would re-render the case in its closed state and the close form unmounts).
// - The closeCaseRequestSchema note is trimmed to 3..500 chars; the UI enforces the
//   trimmed minimum before step 2 and submission, and caps input at 500 characters.
import { useId, useReducer, useRef, type FormEvent } from "react";
import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon } from "@/app/components/icons";
import {
  closeCaseRequestSchema,
  closeCaseResponseSchema,
  type CloseCaseRequest,
  type CloseCaseResponse,
} from "@/contracts";
import { locales, type Locale, type MessageKey } from "@/locales";
import { localizeDigits } from "@/lib/numerals";

// Small typed wrapper around fetch. The route layer returns the contract envelope or a
// JSON error body; we only care about the contract schema here.
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const postJson = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

type Outcome = "coordination_recorded" | "resolved_outside_fera";

const NOTE_MIN = 3;
const NOTE_MAX = 500;

// "coordination_recorded" is the one that needs a referral record; the page guards the
// status, the contract schema trims the note, and the service E-005s the version.

// Outcome labels by locale. Bangla keys intentionally avoid rescue / return / reunification
// wording; the wording guard test in the suite enforces this on every new string.
const OUTCOME_LABEL: Record<Locale, Record<Outcome, string>> = {
  bn: {
    coordination_recorded: "শনাক্ত, রেফারেল হয়েছে",
    resolved_outside_fera: "ফেরার বাইরে নিষ্পত্তি",
  },
  en: {
    coordination_recorded: "Located, referral recorded",
    resolved_outside_fera: "Resolved outside Fera",
  },
};

type State = {
  // step 1: outcome + note collected; step 2: final close.
  step: 1 | 2;
  // True once the officer has moved between steps. The initial step 1 does not
  // carry a data-step attribute — step 1 is the default, and the attribute only
  // appears once the form has been driven past it.
  stepped: boolean;
  outcome: Outcome;
  note: string;
  status: "idle" | "submitting";
  success: CloseCaseResponse | null;
  failure: Failure | null;
};

type Failure = "note" | "stale" | "closed" | "not-allowed" | "generic";
type ApiFailure = Exclude<Failure, "note">;

type Action =
  | { type: "set-outcome"; value: Outcome }
  | { type: "set-note"; value: string }
  | { type: "next" }
  | { type: "back" }
  | { type: "submitting" }
  | { type: "success"; data: CloseCaseResponse }
  | { type: "failure"; failure: Failure | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "set-outcome":
      return { ...state, outcome: action.value, success: null, failure: null };
    case "set-note":
      return { ...state, note: action.value, failure: null };
    case "next":
      return state.note.trim().length >= NOTE_MIN
        ? { ...state, step: 2, stepped: true, failure: null }
        : { ...state, failure: "note" };
    case "back":
      return { ...state, step: 1, stepped: true };
    case "submitting":
      return { ...state, status: "submitting", failure: null };
    case "success":
      return { ...state, status: "idle", success: action.data, failure: null };
    case "failure":
      return { ...state, status: "idle", failure: action.failure };
  }
}

function initialState(outcome: Outcome): State {
  return { step: 1, stepped: false, outcome, note: "", status: "idle", success: null, failure: null };
}

async function postClose(
  caseId: string,
  body: CloseCaseRequest,
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: true; data: CloseCaseResponse } | { ok: false; failure: ApiFailure }> {
  const parsed = closeCaseRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false, failure: "generic" };
  let res: Response;
  try {
    res = await fetchImpl(`/api/cases/${encodeURIComponent(caseId)}/close`, {
      ...postJson(parsed.data),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, failure: "generic" };
  }
  let raw: unknown = null;
  try {
    raw = await res.json();
  } catch {
    raw = null;
  }
  if (!res.ok) {
    // Route envelope: { error: { id: "E-005" | "E-017" | "E-021" | ... } }
    const errorId =
      raw && typeof raw === "object" && "error" in raw
        ? (raw as { error?: { id?: string } }).error?.id
        : undefined;
    if (errorId === "E-005") return { ok: false, failure: "stale" };
    if (errorId === "E-017") return { ok: false, failure: "not-allowed" };
    if (res.status === 409 || errorId === "E-005") return { ok: false, failure: "stale" };
    if (res.status === 404) return { ok: false, failure: "closed" };
    return { ok: false, failure: "generic" };
  }
  const validated = closeCaseResponseSchema.safeParse(raw);
  if (!validated.success) return { ok: false, failure: "generic" };
  return { ok: true, data: validated.data };
}

export function CloseForm({
  locale,
  caseId,
  allowedOutcome,
  expectedVersion,
  fetchImpl,
}: {
  locale: Locale;
  caseId: string;
  // null when the case is in a state where closure is not allowed (already closed, or
  // submitted/matched_pending_review that has no outcome). The page still renders this
  // component so the copy stays in one place; it shows the not-allowed notice and skips
  // the form.
  allowedOutcome: Outcome | null;
  expectedVersion: number;
  fetchImpl?: FetchLike;
}) {
  const t = locales[locale] as Record<MessageKey, string>;
  const uid = useId();
  const id = {
    outcome: `${uid}-outcome`,
    note: `${uid}-note`,
    noteError: `${uid}-note-error`,
    success: `${uid}-success`,
    failure: `${uid}-failure`,
  };

  const [state, dispatch] = useReducer(reducer, initialState(allowedOutcome ?? "resolved_outside_fera"));
  const formRef = useRef<HTMLFormElement>(null);

  if (allowedOutcome === null) {
    return (
      <section
        aria-labelledby="close-heading"
        data-state="not-allowed"
        className="flex flex-col gap-2 rounded-lg border border-hairline bg-elevated px-4 py-3"
      >
        <h2 id="close-heading" className="text-heading-4 font-semibold text-ink">
          {t.closeTitle}
        </h2>
        <p className="flex items-start gap-2 text-body-sm text-mute">
          <CircleAlertIcon className="mt-0.5 size-4 text-faint" aria-hidden="true" />
          <span>{t.closeNotAllowed}</span>
        </p>
      </section>
    );
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (state.status === "submitting") return;
    if (state.step === 1) {
      dispatch({ type: "next" });
      return;
    }
    if (state.note.trim().length < NOTE_MIN) {
      dispatch({ type: "failure", failure: "note" });
      return;
    }
    dispatch({ type: "submitting" });
    const result = await postClose(
      caseId,
      { outcome: state.outcome, note: state.note.trim(), expected_version: expectedVersion },
      fetchImpl,
    );
    if (result.ok) {
      dispatch({ type: "success", data: result.data });
    } else {
      dispatch({ type: "failure", failure: result.failure });
    }
  };

  return (
    <section aria-labelledby="close-heading" data-state="ready" className="flex flex-col gap-3">
      <h2 id="close-heading" className="text-heading-4 font-semibold text-ink">
        {t.closeTitle}
      </h2>
      <p className="text-body-sm text-mute">{t.closeIntro}</p>
      {state.success ? (
        <div
          id={id.success}
          role="status"
          data-state="success"
          className="flex flex-col gap-2 rounded-md border border-success-border bg-success-soft px-3 py-3"
        >
          <p className="flex items-start gap-2 text-body-sm font-medium text-success-text">
            <CircleCheckIcon className="mt-0.5 size-4" aria-hidden="true" />
            <span>{t.closeSuccessTitle}</span>
          </p>
          <p className="text-body-sm text-ink">{t.closeSuccessBody}</p>
          <p className="text-caption-md text-mute">
            {locale === "bn"
              ? `রেফারেন্স: ${state.success.ref_code} · ${localizeDigits(
                  new Date(state.success.closed_at).getTime() / 1000,
                  "bn",
                )} সেকেন্ড আগে`
              : `Reference: ${state.success.ref_code}`}
          </p>
        </div>
      ) : (
        <form
          ref={formRef}
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-4"
          data-step={state.stepped ? state.step : undefined}
          data-outcome={state.outcome}
        >
          <fieldset
            disabled={state.status === "submitting" || state.step === 2}
            className="flex flex-col gap-2"
          >
            <legend className="text-body-sm font-medium text-ink">{t.closeOutcomeLabel}</legend>
            <div className="flex flex-col gap-2" data-test="close-outcome">
              {(["coordination_recorded", "resolved_outside_fera"] as const).map((value) => (
                <label
                  key={value}
                  className="flex items-start gap-2 rounded-md border border-hairline bg-elevated px-3 py-2 text-body-sm text-ink"
                >
                  <input
                    type="radio"
                    name="outcome"
                    value={value}
                    checked={state.outcome === value}
                    onChange={() => dispatch({ type: "set-outcome", value })}
                    className="mt-1 size-4 accent-primary"
                    disabled={value !== allowedOutcome}
                    data-value={value}
                    data-allowed={value === allowedOutcome}
                  />
                  <span>{OUTCOME_LABEL[locale][value]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1">
            <label htmlFor={id.note} className="text-body-sm font-medium text-ink">
              {t.closeNoteLabel}
            </label>
            <p className="text-caption-md text-mute">{t.closeNoteHint}</p>
            <textarea
              id={id.note}
              name="note"
              value={state.note}
              onChange={(e) => dispatch({ type: "set-note", value: e.target.value.slice(0, NOTE_MAX) })}
              rows={3}
              required
              minLength={NOTE_MIN}
              maxLength={NOTE_MAX}
              aria-invalid={state.failure === "note"}
              aria-describedby={state.failure === "note" ? id.noteError : undefined}
              className="rounded-md border border-hairline-strong bg-elevated px-3 py-2 text-body-sm text-ink focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
              data-state="editable"
            />
            <p className="text-caption-md text-mute">
              {locale === "bn"
                ? `${localizeDigits(state.note.length, "bn")} / ${localizeDigits(NOTE_MAX, "bn")}`
                : `${state.note.length} / ${NOTE_MAX}`}
            </p>
          </div>

          {state.failure ? (
            <div
              id={id.failure}
              role="alert"
              data-state={state.failure}
              className="flex flex-col gap-2 rounded-md border border-hairline bg-elevated px-3 py-2"
            >
              {state.failure === "note" ? (
                <p id={id.noteError} className="text-body-sm text-ink" data-state="note-error">
                  {t.closeNoteRequired}
                </p>
              ) : state.failure === "stale" ? (
                <>
                  <p className="flex items-start gap-2 text-body-sm text-ink">
                    <CircleAlertIcon className="mt-0.5 size-4 text-faint" aria-hidden="true" />
                    <span>{t.closeStaleVersion}</span>
                  </p>
                  {state.note.trim().length > 0 ? (
                    <p className="text-caption-md text-mute" data-state="kept-note">
                      <span className="block">{t.closeMissingNote}</span>
                      <span className="block whitespace-pre-wrap rounded-sm border border-hairline bg-surface px-2 py-1 text-ink">
                        {state.note}
                      </span>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") window.location.reload();
                    }}
                    className="inline-flex min-h-11 items-center justify-center rounded-md border border-hairline-strong bg-elevated px-3 py-2 text-body-sm font-medium text-ink hover:bg-primary-pressed/10"
                  >
                    {t.closeReload}
                  </button>
                </>
              ) : state.failure === "closed" ? (
                <p className="text-body-sm text-ink">{t.closeClosedNotice}</p>
              ) : state.failure === "not-allowed" ? (
                <p className="text-body-sm text-ink">{t.closeNotAllowed}</p>
              ) : (
                <p className="text-body-sm text-ink">{t.closeErrorGeneric}</p>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {state.step === 1 ? (
              <button
                type="submit"
                disabled={state.status === "submitting"}
                className="inline-flex min-h-11 items-center justify-center rounded-md border border-hairline-strong bg-elevated px-4 py-2 text-body-sm font-medium text-ink hover:bg-primary-pressed/10"
                data-state="step-1"
              >
                {t.closeConfirm1}
              </button>
            ) : (
              <>
                <p
                  className="text-caption-md text-mute"
                  aria-live="polite"
                  data-state="step-2-prompt"
                >
                  {t.closeStep2}
                </p>
                <button
                  type="button"
                  onClick={() => dispatch({ type: "back" })}
                  disabled={state.status === "submitting"}
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-hairline-strong bg-elevated px-3 py-2 text-body-sm font-medium text-ink hover:bg-primary-pressed/10"
                >
                  {t.closeStep1}
                </button>
                <button
                  type="submit"
                  disabled={state.status === "submitting"}
                  data-state="step-2-confirm"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-hairline-strong bg-elevated px-4 py-2 text-body-sm font-medium text-ink hover:bg-primary-pressed/10"
                >
                  {state.status === "submitting" ? (
                    <>
                      <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
                      <span>{t.closeSubmitting}</span>
                    </>
                  ) : (
                    <span>{t.closeConfirm2}</span>
                  )}
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
