"use client";

// SCREEN-010 match review (TASK-028; COMP-037 evidence table, COMP-038 decision panel,
// COMP-049 duplicate banner). The comparison and request building are pure
// (src/lib/match-review.ts); this file wires them to the DOM.
//
// - Nothing is decided by this screen's logic: the buttons send the officer's choice to
//   API-010, where the one-transaction `decideCandidate` runs.
// - Confirm is a two-step: the button opens a dialog with the four reviewer checklist
//   items the contract requires and the "referral is a simulation" sentence; only the
//   dialog's second button sends. Reject needs a 3–500 character reason on the page.
// - After a decision the stored state is shown; a retry after success is E-005 by design,
//   so "stale" and "uncertain" both offer a reload, never a blind second press.
import { useEffect, useId, useReducer, useRef, useState } from "react";
import { CircleAlertIcon, ClockIcon, EyeIcon, InfoIcon, LoaderCircleIcon } from "@/app/components/icons";
import { CircleCheckIcon, CircleHelpIcon, CircleXIcon } from "@/app/components/status-icons";
import { decisionResponseSchema, type CandidateDecisionView, type DecisionResponse } from "@/contracts";
import { localizeDigits } from "@/lib/numerals";
import {
  CHECKLIST_KEYS,
  buildConfirm,
  buildReject,
  compareCases,
  componentEntries,
  displayComponent,
  displayScore,
  emptyChecklist,
  requestDecision,
  summarise,
  type Checklist,
  type CompareField,
  type DecisionFailure,
  type Verdict,
} from "@/lib/match-review";
import { locales, type Locale, type MessageKey } from "@/locales";

const CAPTION = "text-caption-md [&:lang(bn)]:text-body-sm";
const FIELD_KEY: Record<CompareField, MessageKey> = {
  sex: "matchFieldSex",
  age: "matchFieldAge",
  height: "matchFieldHeight",
  district: "matchFieldDistrict",
  place: "matchFieldPlace",
  time: "matchFieldTime",
  clothing: "matchFieldClothing",
  marks: "matchFieldMarks",
  circumstances: "matchFieldCircumstances",
};
const VERDICT: Record<Verdict, { key: MessageKey; Icon: typeof CircleCheckIcon; tone: string }> = {
  agree: { key: "matchVerdictAgree", Icon: CircleCheckIcon, tone: "text-success-text" },
  differ: { key: "matchVerdictDiffer", Icon: CircleXIcon, tone: "text-danger-text" },
  unknown: { key: "matchVerdictUnknown", Icon: CircleHelpIcon, tone: "text-mute" },
  review: { key: "matchVerdictReview", Icon: EyeIcon, tone: "text-info-text" },
};
const CHECK_KEY: Record<(typeof CHECKLIST_KEYS)[number], MessageKey> = {
  descriptions_reviewed: "matchReviewCheck1",
  contradictions_reviewed: "matchReviewCheck2",
  identity_not_proven_by_score: "matchReviewCheck3",
  referral_is_simulated: "matchReviewCheck4",
};

type State =
  | { status: "idle"; failure: DecisionFailure | null; reasonError: "required" | "length" | null }
  | { status: "submitting"; failure: null; reasonError: null }
  | { status: "decided"; response: DecisionResponse; failure: null; reasonError: null };
type Action =
  | { type: "submit" }
  | { type: "failed"; failure: DecisionFailure }
  | { type: "decided"; response: DecisionResponse }
  | { type: "reason"; error: "required" | "length" | null };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "submit":
      return { status: "submitting", failure: null, reasonError: null };
    case "failed":
      return { status: "idle", failure: action.failure, reasonError: null };
    case "decided":
      return { status: "decided", response: action.response, failure: null, reasonError: null };
    case "reason":
      return { status: "idle", failure: state.status === "idle" ? state.failure : null, reasonError: action.error };
  }
}

const joinIds = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ") || undefined;

const parseResponse = (body: unknown): DecisionResponse | null => {
  const r = decisionResponseSchema.safeParse(body);
  return r.success ? r.data : null;
};

// ISO with an explicit +06:00 offset: shown as the wall time it already carries, no Intl,
// so server and client markup are identical.
function showTime(iso: string, locale: Locale): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? localizeDigits(`${m[1]} ${m[2]}`, locale) : iso;
}

export function MatchReview({ view, locale, queueHref }: { view: CandidateDecisionView; locale: Locale; queueHref: string }) {
  const t = locales[locale];
  const uid = useId();
  const [state, dispatch] = useReducer(reducer, { status: "idle", failure: null, reasonError: null } as State);
  const [checklist, setChecklist] = useState<Checklist>(emptyChecklist);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const confirmTriggerRef = useRef<HTMLButtonElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);

  const rows = compareCases(view.missing, view.found, locale);
  const summary = summarise(rows);
  const duplicates = [...new Set([...view.missing.duplicate_of, ...view.found.duplicate_of])];
  // After a lost or stale reply the decision may already be stored: no second press until the
  // stored state is reloaded (a blind retry would only be E-005, or a duplicate attempt).
  const mustReload = state.status === "idle" && state.failure !== null && (state.failure.kind === "stale" || state.failure.kind === "uncertain");
  const decidable = view.qualified && state.status !== "decided" && !mustReload;
  const submitting = state.status === "submitting";

  useEffect(() => {
    if (state.status === "decided") resultRef.current?.focus();
  }, [state.status]);

  // After a failed decision the buttons re-render; focus moves to the message so it is read
  // and the officer is not left on a control that just changed.
  useEffect(() => {
    if (state.status === "idle" && state.failure) alertRef.current?.focus();
  }, [state.status, state.failure]);

  const cellText = (v: string | null, field: CompareField) => {
    if (v === null) return t.matchReviewUnknownValue;
    if (field === "sex") return v === "male" ? t.matchReviewSex_male : v === "female" ? t.matchReviewSex_female : t.matchReviewSex_other;
    if (field === "time") return showTime(v, locale);
    if (field === "age" || field === "height") return localizeDigits(v, locale);
    return v;
  };

  async function send(build: ReturnType<typeof buildConfirm>) {
    if (!build.ok) {
      dispatch({ type: "failed", failure: { kind: "validation" } });
      return;
    }
    if (busy.current) return;
    busy.current = true;
    dispatch({ type: "submit" });
    try {
      const out = await requestDecision(view.candidate_id, build.request, { parse: parseResponse });
      if (out.kind === "decided") dispatch({ type: "decided", response: out.response });
      else dispatch({ type: "failed", failure: out.failure });
    } catch {
      dispatch({ type: "failed", failure: { kind: "uncertain" } });
    } finally {
      busy.current = false;
    }
  }

  function openDialog() {
    if (submitting || !decidable) return;
    setChecklist(emptyChecklist());
    if (noteRef.current) noteRef.current.value = "";
    dialog.current?.showModal();
    // Safe initial focus: native dialog focuses the first focusable child, but the heading
    // is the predictable read-first element. tabIndex=-1 lets it receive focus without
    // adding a tab stop. Falls back to cancel if the heading is not yet mounted.
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (cb: () => void) => { setTimeout(cb, 0); };
    raf(() => {
      if (dialogTitleRef.current) dialogTitleRef.current.focus();
      else dialog.current?.querySelector<HTMLButtonElement>('button[type="button"]:last-of-type')?.focus();
    });
  }
  function closeDialog() {
    dialog.current?.close();
    // Native dialog restores focus to the opener, but on success the trigger is removed
    // (resultRef is already focused); only restore on CANCEL/Escape.
    if (state.status !== "decided") confirmTriggerRef.current?.focus();
  }
  async function confirm() {
    const note = noteRef.current?.value ?? "";
    const build = buildConfirm(view, checklist, note);
    if (!build.ok) return;
    dialog.current?.close();
    await send(build);
  }
  async function reject() {
    if (submitting || !decidable) return;
    const reason = reasonRef.current?.value ?? "";
    const build = buildReject(view, reason);
    if (!build.ok) {
      dispatch({ type: "reason", error: build.reason === "reason-required" ? "required" : "length" });
      reasonRef.current?.focus();
      return;
    }
    await send(build);
  }

  const failureText = (f: DecisionFailure): string => {
    switch (f.kind) {
      case "stale": return t.matchReviewStale;
      case "hidden": return t.matchReviewHidden;
      case "forbidden": return t.matchReviewForbidden;
      case "validation": return t.matchReviewValidation;
      case "session": return t.matchReviewSession;
      case "offline": return t.matchReviewOffline;
      case "uncertain": return t.matchReviewUncertain;
      case "rate-limited":
        return f.seconds === null ? t.matchReviewRateLimitedSoon : t.matchReviewRateLimited.replace("{s}", localizeDigits(f.seconds, locale));
      default: return t.matchReviewGeneric;
    }
  };
  const needsReload = (f: DecisionFailure) => f.kind === "stale" || f.kind === "uncertain" || f.kind === "validation" || f.kind === "generic";

  const refLabel = (ref: string) => <span lang="en" translate="no" className="font-mono">{ref}</span>;

  return (
    <div className="flex flex-col gap-8">
      {/* Similarity, never a probability */}
      <section aria-labelledby={`${uid}-sim`} className="flex flex-col gap-1">
        <h2 id={`${uid}-sim`} className="text-body-sm font-medium text-mute">{t.matchReviewSimilarity}</h2>
        <p className="text-heading-2 font-semibold text-ink">
          {localizeDigits(displayScore(view.score), locale)} <span className="text-body-md font-normal text-mute">/ {localizeDigits(100, locale)}</span>
        </p>
        <p className={`text-mute ${CAPTION}`}>{t.matchReviewSimilarityNote}</p>
      </section>

      {!view.qualified && (
        <p id={`${uid}-notq`} className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-body-sm text-warning-text">
          <CircleAlertIcon className="mt-[0.2em] size-4" />
          <span>{t.matchReviewNotQualified}</span>
        </p>
      )}

      {duplicates.length > 0 && (
        <aside className="flex items-start gap-2 rounded-md border border-dashed border-hairline-strong px-3 py-2.5 text-body-sm text-body">
          <InfoIcon className="mt-[0.2em] size-4 text-info" />
          <p>
            <strong className="font-semibold text-ink">{t.matchReviewDuplicate}</strong> — {t.matchReviewDuplicateNote}{" "}
            {duplicates.map((d, i) => (
              <span key={d.id}>{i > 0 && ", "}{refLabel(d.ref)}</span>
            ))}
          </p>
        </aside>
      )}

      {/* COMP-037 evidence table */}
      <div className="hidden min-w-0 overflow-x-auto sm:block" tabIndex={0} role="region" aria-label={t.matchReviewTableCaption}>
        <table className="w-full border-collapse text-left text-body-sm">
          <caption className="sr-only">{t.matchReviewTableCaption}</caption>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.matchReviewField}</th>
              <th scope="col" className="py-2 pr-3 font-medium text-ink">{t.matchReviewMissing} {refLabel(view.missing.ref_code)}</th>
              <th scope="col" className="py-2 pr-3 font-medium text-ink">{t.matchReviewFound} {refLabel(view.found.ref_code)}</th>
              <th scope="col" className="py-2 font-medium text-mute">{t.matchReviewResult}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = VERDICT[r.verdict];
              return (
                <tr key={r.field} className="border-b border-hairline align-top">
                  <th scope="row" className="py-2 pr-3 font-medium text-body">{t[FIELD_KEY[r.field]]}</th>
                  <td className={`py-2 pr-3 ${r.missing === null ? "text-mute" : "text-ink"}`}>{cellText(r.missing, r.field)}</td>
                  <td className={`py-2 pr-3 ${r.found === null ? "text-mute" : "text-ink"}`}>{cellText(r.found, r.field)}</td>
                  <td className={`py-2 ${v.tone}`}>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <v.Icon className="size-4" />
                      <span>{t[v.key]}</span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Below sm the same rows are stacked, so there is no two-axis scrolling at 320 px */}
      <ul className="flex flex-col gap-4 sm:hidden">
        {rows.map((r) => {
          const v = VERDICT[r.verdict];
          return (
            <li key={r.field} className="flex flex-col gap-1 border-b border-hairline pb-3 text-body-sm">
              <span className="font-medium text-body">{t[FIELD_KEY[r.field]]}</span>
              <span className="text-ink">
                <span className="text-mute">{t.matchReviewMissing}: </span>{cellText(r.missing, r.field)}
              </span>
              <span className="text-ink">
                <span className="text-mute">{t.matchReviewFound}: </span>{cellText(r.found, r.field)}
              </span>
              <span className={`inline-flex items-center gap-1.5 ${v.tone}`}>
                <v.Icon className="size-4" />
                <span>{t[v.key]}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {rows.find((r) => r.field === "district")?.verdict === "review" && (
        <p className={`text-mute ${CAPTION}`}>{t.matchReviewDifferentDistrictNote}</p>
      )}

      <section aria-labelledby={`${uid}-sum`} className="flex flex-col gap-1 text-body-sm">
        <h2 id={`${uid}-sum`} className="font-medium text-ink">{t.matchReviewSummary}</h2>
        <p className="text-body">
          <span className="font-medium">{t.matchReviewSummaryDiffer}</span>{" "}
          {summary.differ.length === 0 ? "—" : summary.differ.map((f) => t[FIELD_KEY[f]]).join(", ")}
        </p>
        <p className="text-body">
          <span className="font-medium">{t.matchReviewSummaryUnknown}</span>{" "}
          {summary.unknown.length === 0 ? "—" : summary.unknown.map((f) => t[FIELD_KEY[f]]).join(", ")}
        </p>
      </section>

      <section aria-labelledby={`${uid}-contacts`} className="flex flex-col gap-1 text-body-sm">
        <h2 id={`${uid}-contacts`} className="font-medium text-ink">{t.matchReviewContacts}</h2>
        <p className="text-body">
          {refLabel(view.missing.ref_code)}: <span lang="en" translate="no">{view.missing.contact_phone ?? "—"}</span>
          {" · "}
          {refLabel(view.found.ref_code)}: <span lang="en" translate="no">{view.found.contact_phone ?? "—"}</span>
        </p>
      </section>

      {Object.keys(view.components).length > 0 && (
        <section aria-labelledby={`${uid}-comp`} className="flex flex-col gap-1 text-body-sm">
          <h2 id={`${uid}-comp`} className="font-medium text-ink">{t.matchReviewComponents}</h2>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-body">
            {componentEntries(view.components).map((c) => (
              <li key={c.key}>
                <span lang="en" translate="no" className="font-mono">{c.key}</span>:{" "}
                {c.value === null ? t.matchReviewComponentUnknown : localizeDigits(displayComponent(c.value), locale)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* COMP-038 decision panel */}
      <section aria-labelledby={`${uid}-decision`} className="flex flex-col gap-4 border-t border-hairline pt-6" aria-busy={submitting || undefined}>
        <h2 id={`${uid}-decision`} className="text-body-md font-semibold text-ink">{t.matchReviewDecision}</h2>

        <div ref={alertRef} tabIndex={-1} role="alert" aria-atomic="true" className="outline-offset-2">
          {state.failure && (
            <p id={`${uid}-failure`} className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-body-sm text-warning-text">
              {state.failure.kind === "offline" || state.failure.kind === "rate-limited" ? <ClockIcon className="mt-[0.2em] size-4" /> : <CircleAlertIcon className="mt-[0.2em] size-4" />}
              <span>{failureText(state.failure)}</span>
            </p>
          )}
        </div>
        {state.failure && needsReload(state.failure) && (
          <button type="button" onClick={() => window.location.reload()} className="min-h-11 self-start rounded-md border border-control bg-elevated px-4 text-body-sm font-medium text-ink hover:border-control-strong">
            {t.matchReviewReload}
          </button>
        )}

        {state.status === "decided" ? (
          <div ref={resultRef} tabIndex={-1} className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-[16px] shadow-1 sm:p-6">
            <p role="status" className="flex items-center gap-2 text-heading-4 font-semibold text-success-text">
              <CircleCheckIcon className="size-5" />
              <span>{state.response.candidate_status === "confirmed" ? t.matchReviewConfirmed : t.matchReviewRejected}</span>
            </p>
            {state.response.candidate_status === "rejected" && <p className="text-body-sm text-body">{t.matchReviewRejectedNote}</p>}
            <a href={queueHref} className="min-h-11 self-start rounded-md border border-control bg-elevated px-4 py-2.5 text-body-md font-medium text-ink hover:border-control-strong">
              {t.matchReviewBack}
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div>
              <button
                ref={confirmTriggerRef}
                type="button"
                onClick={openDialog}
                aria-disabled={!decidable || submitting || undefined}
                disabled={!decidable}
                aria-describedby={joinIds(!view.qualified && `${uid}-notq`, mustReload && `${uid}-failure`)}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-body-md font-semibold text-on-primary hover:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />}
                <span>{submitting ? t.matchReviewSubmitting : t.matchReviewConfirm}</span>
              </button>
            </div>

            <div className="flex max-w-[34rem] flex-col gap-2">
              <label htmlFor={`${uid}-reason`} className="text-body-sm font-medium text-ink">{t.matchReviewRejectReason}</label>
              <textarea
                ref={reasonRef}
                id={`${uid}-reason`}
                rows={3}
                maxLength={500}
                disabled={!decidable}
                onChange={() => {
                  if (state.reasonError) dispatch({ type: "reason", error: null });
                }}
                aria-invalid={state.reasonError ? true : undefined}
                aria-describedby={joinIds(state.reasonError && `${uid}-reason-error`, !view.qualified && `${uid}-notq`, mustReload && `${uid}-failure`)}
                className="min-h-11 w-full rounded-md border border-control bg-elevated px-3 py-2 text-body-md text-ink hover:border-control-strong focus:border-control-strong aria-invalid:border-danger"
              />
              {state.reasonError && (
                <p id={`${uid}-reason-error`} className={`flex items-start gap-1.5 text-danger-text ${CAPTION}`}>
                  <CircleAlertIcon className="mt-[0.2em] size-3.5" />
                  <span>{state.reasonError === "required" ? t.matchReviewReasonRequired : t.matchReviewReasonLength}</span>
                </p>
              )}
              <button
                type="button"
                onClick={reject}
                disabled={!decidable}
                aria-disabled={submitting || undefined}
                aria-describedby={joinIds(mustReload && `${uid}-failure`)}
                className="min-h-11 self-start rounded-md border border-control bg-elevated px-5 text-body-md font-medium text-ink hover:border-control-strong disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t.matchReviewReject}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Second step of Confirm (D3: the confirm needs a dialog) */}
      <dialog
        ref={dialog}
        aria-labelledby={`${uid}-dlg-title`}
        onCancel={() => {
          // Escape fires before close; restore focus to the trigger on the next tick so
          // the trigger still exists at the time focus moves.
          queueMicrotask(() => {
            if (state.status !== "decided") confirmTriggerRef.current?.focus();
          });
        }}
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-lg border border-hairline bg-surface p-[16px] text-body shadow-2 backdrop:bg-scrim sm:p-6"
      >
        <form method="dialog" onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
          <h2 id={`${uid}-dlg-title`} ref={dialogTitleRef} tabIndex={-1} className="text-heading-4 font-semibold text-ink outline-none">{t.matchReviewDialogTitle}</h2>
          <p className="text-body-md">{t.matchReviewDialogBody}</p>
          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-body-sm font-medium text-ink">{t.matchReviewChecklistLegend}</legend>
            {CHECKLIST_KEYS.map((k) => (
              <label key={k} className="flex min-h-11 items-start gap-3 text-body-sm text-ink">
                <input
                  type="checkbox"
                  checked={checklist[k]}
                  onChange={(e) => setChecklist((c) => ({ ...c, [k]: e.target.checked }))}
                  className="mt-1 size-5"
                />
                <span>{t[CHECK_KEY[k]]}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${uid}-note`} className="text-body-sm font-medium text-ink">{t.matchReviewNote}</label>
            <textarea ref={noteRef} id={`${uid}-note`} rows={2} maxLength={500}
              className="min-h-11 w-full rounded-md border border-control bg-elevated px-3 py-2 text-body-md text-ink hover:border-control-strong focus:border-control-strong" />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={confirm}
              disabled={!CHECKLIST_KEYS.every((k) => checklist[k])}
              className="min-h-11 rounded-md bg-primary px-5 text-body-md font-semibold text-on-primary hover:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t.matchReviewConfirmFinal}
            </button>
            <button
              type="button"
              onClick={closeDialog}
              className="min-h-11 rounded-md border border-control bg-elevated px-5 text-body-md font-medium text-ink hover:border-control-strong"
            >
              {t.matchReviewCancel}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
