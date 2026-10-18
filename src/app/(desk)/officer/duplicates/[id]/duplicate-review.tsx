"use client";

// SCREEN-014 duplicate review form (TASK-051; FR-023; SCREEN-014; BR-021; TC-038).
//
// Compare the two same-kind reports side by side; the officer explicitly marks
// the pair as "same child" or "different". Nothing here is decided by the
// client: the form sends a single POST to API-023 and the one-transaction
// service runs the lock + audit. The page is bilingual; the strings come from
// src/locales/areas/officer-duplicates.ts.
//
// - Profile evidence checkbox is required. Without it the form refuses to send
//   (it is also a required literal in the request schema).
// - A 3..500 character reason is required. The form shows a typed reason error.
// - The "Same child" button is disabled when the link's rule is 'same_phone':
//   BR-021, FV-02 and TC-038 say a shared phone alone NEVER confirms the same
//   child. The page keeps the "Different" path usable; the note
//   `duplicatePhoneOnlyRefusal` is shown on the button tooltip.
// - After a successful decision the stored state is shown; a retry after success
//   is E-005 by design, so the buttons hide.
// - Synthetic and [MOCK] labels stay visible. No probability, no identity claim.
import { useEffect, useId, useReducer, useRef, useState } from "react";
import { CircleAlertIcon, CircleCheckIcon, ClockIcon, LoaderCircleIcon } from "@/app/components/icons";
import { duplicateDecisionResponseSchema, type DuplicateDecisionResponse, type OfficerCaseRow } from "@/contracts";
import type { OfficerDuplicateView } from "@/server/duplicates/read";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale, type MessageKey } from "@/locales";

type CompareRow = {
  key: CompareField;
  a: string | null;
  b: string | null;
  verdict: "agree" | "differ" | "unknown" | "review";
};

type CompareField = "sex" | "age" | "district" | "time" | "height" | "clothing" | "marks" | "name" | "circumstances";

const COMPARE_FIELDS: readonly CompareField[] = ["name", "sex", "age", "height", "district", "time", "clothing", "marks", "circumstances"];

const FIELD_KEY: Record<CompareField, MessageKey> = {
  name: "duplicateFieldName" as MessageKey,
  sex: "matchFieldSex" as MessageKey,
  age: "matchFieldAge" as MessageKey,
  height: "matchFieldHeight" as MessageKey,
  district: "matchFieldDistrict" as MessageKey,
  time: "matchFieldTime" as MessageKey,
  clothing: "matchFieldClothing" as MessageKey,
  marks: "matchFieldMarks" as MessageKey,
  circumstances: "matchFieldCircumstances" as MessageKey,
};

type State =
  | { status: "idle"; failure: DecisionFailure | null; reasonError: "required" | "length" | null }
  | { status: "submitting"; failure: null; reasonError: null }
  | { status: "decided"; response: DuplicateDecisionResponse; failure: null; reasonError: null };

type Action =
  | { type: "submit" }
  | { type: "failed"; failure: DecisionFailure }
  | { type: "decided"; response: DuplicateDecisionResponse }
  | { type: "reason"; error: "required" | "length" | null };

type DecisionFailure =
  | { kind: "stale" }
  | { kind: "hidden" }
  | { kind: "forbidden" }
  | { kind: "validation" }
  | { kind: "session" }
  | { kind: "offline" }
  | { kind: "uncertain" }
  | { kind: "rate-limited"; seconds: number | null }
  | { kind: "generic" };

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

const parseResponse = (body: unknown): DuplicateDecisionResponse | null => {
  const r = duplicateDecisionResponseSchema.safeParse(body);
  return r.success ? r.data : null;
};

const readJson = async (res: Response): Promise<unknown> => {
  try { return await res.json(); } catch { return null; }
};

const translateError = (status: number, body: unknown, failure: DecisionFailure): DecisionFailure => {
  if (status === 401 || status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "hidden" };
  if (status === 409 || status === 410) return { kind: "stale" };
  if (status === 422) return { kind: "validation" };
  if (status === 429) {
    const retryAfter = Number((body as { retry_after?: number } | null)?.retry_after);
    return { kind: "rate-limited", seconds: Number.isFinite(retryAfter) ? retryAfter : null };
  }
  return failure;
};

const verdictKey: Record<CompareRow["verdict"], MessageKey> = {
  agree: "duplicateCompareAgree" as MessageKey,
  differ: "duplicateCompareDiffer" as MessageKey,
  unknown: "duplicateCompareUnknown" as MessageKey,
  review: "duplicateCompareReview" as MessageKey,
};

const verdictTone: Record<CompareRow["verdict"], string> = {
  agree: "text-success-text",
  differ: "text-danger-text",
  unknown: "text-mute",
  review: "text-info-text",
};

function compareCase(a: OfficerCaseRow, b: OfficerCaseRow): CompareRow[] {
  const rows: CompareRow[] = [];
  const same = (x: string | null | number, y: string | null | number) => (x === null || y === null ? "unknown" : x === y ? "agree" : "differ");
  rows.push({ key: "name", a: a.child.name, b: b.child.name, verdict: same(a.child.name, b.child.name) });
  rows.push({ key: "sex", a: a.child.sex, b: b.child.sex, verdict: same(a.child.sex, b.child.sex) });
  const aAge = a.child.age_years !== null ? String(a.child.age_years) : a.child.age_min !== null && a.child.age_max !== null ? `${a.child.age_min}–${a.child.age_max}` : null;
  const bAge = b.child.age_years !== null ? String(b.child.age_years) : b.child.age_min !== null && b.child.age_max !== null ? `${b.child.age_min}–${b.child.age_max}` : null;
  rows.push({ key: "age", a: aAge, b: bAge, verdict: same(aAge, bAge) });
  rows.push({ key: "height", a: a.child.height_cm !== null ? String(a.child.height_cm) : null, b: b.child.height_cm !== null ? String(b.child.height_cm) : null, verdict: same(a.child.height_cm, b.child.height_cm) });
  rows.push({ key: "district", a: a.event.district_name_bn, b: b.event.district_name_bn, verdict: a.event.district_code === null || b.event.district_code === null ? "unknown" : a.event.district_code === b.event.district_code ? "agree" : "differ" });
  rows.push({ key: "time", a: a.event.at, b: b.event.at, verdict: a.event.at === null || b.event.at === null ? "unknown" : a.event.at === b.event.at ? "agree" : a.event.at_lower === b.event.at_lower && a.event.at_upper === b.event.at_upper ? "review" : "differ" });
  rows.push({ key: "clothing", a: a.child.clothing, b: b.child.clothing, verdict: same(a.child.clothing, b.child.clothing) });
  rows.push({ key: "marks", a: a.child.marks, b: b.child.marks, verdict: same(a.child.marks, b.child.marks) });
  rows.push({ key: "circumstances", a: a.event.circumstances, b: b.event.circumstances, verdict: same(a.event.circumstances, b.event.circumstances) });
  return rows;
}

const showTime = (iso: string, locale: Locale): string => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? localizeDigits(`${m[1]} ${m[2]}`, locale) : iso;
};

const cellText = (v: string | null, field: CompareField, locale: Locale, t: { [k: string]: string }): string => {
  if (v === null) return t.matchReviewUnknownValue as string;
  if (field === "sex") {
    if (v === "male") return t.matchReviewSex_male as string;
    if (v === "female") return t.matchReviewSex_female as string;
    return t.matchReviewSex_other as string;
  }
  if (field === "time") return showTime(v, locale);
  if (field === "age" || field === "height") return localizeDigits(v, locale);
  return v;
};

export function DuplicateReview({ view, locale, listHref }: { view: OfficerDuplicateView; locale: Locale; listHref: string }) {
  const t = locales[locale];
  const uid = useId();
  const [state, dispatch] = useReducer(reducer, { status: "idle", failure: null, reasonError: null } as State);
  const [evidenceChecked, setEvidenceChecked] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);

  const rows = compareCase(view.cases.a, view.cases.b);
  const rule = view.link.rule;
  // BR-021, FV-02, TC-038: shared phone alone NEVER confirms same child. The page
  // disables the "Same child" button on phone-only links; the service also refuses
  // a same_phone + confirmed_same UPDATE as E-005, so even a forged request fails
  // closed. The "Different" path remains usable.
  const phoneOnly = rule === "same_phone";
  const alreadyResolved = view.link.status !== "flagged";
  const decidable = !alreadyResolved && state.status !== "decided" && state.status !== "submitting" && evidenceChecked;

  useEffect(() => {
    if (state.status === "decided") resultRef.current?.focus();
  }, [state.status]);

  useEffect(() => {
    if (state.status === "idle" && state.failure) alertRef.current?.focus();
  }, [state.status, state.failure]);

  const failureText = (f: DecisionFailure): string => {
    switch (f.kind) {
      case "stale": return t.duplicateStale as string;
      case "hidden": return t.duplicateHidden as string;
      case "forbidden": return t.duplicateForbidden as string;
      case "validation": return t.duplicateValidation as string;
      case "session": return t.duplicateSession as string;
      case "offline": return t.duplicateOffline as string;
      case "uncertain": return t.duplicateUncertain as string;
      case "rate-limited":
        return f.seconds === null ? (t.duplicateRateLimitedSoon as string) : (t.duplicateRateLimited as string).replace("{s}", localizeDigits(f.seconds, locale));
      default: return t.duplicateGeneric as string;
    }
  };
  const needsReload = (f: DecisionFailure) => f.kind === "stale" || f.kind === "uncertain" || f.kind === "validation" || f.kind === "generic";

  const refLabel = (ref: string) => <span lang="en" translate="no" className="font-mono">{ref}</span>;

  async function send(status: "confirmed_same" | "dismissed") {
    if (busy.current) return;
    const reason = reasonRef.current?.value ?? "";
    const reasonText = reason.trim();
    if (reasonText.length < 3) { dispatch({ type: "reason", error: "required" }); reasonRef.current?.focus(); return; }
    if (reasonText.length > 500) { dispatch({ type: "reason", error: "length" }); reasonRef.current?.focus(); return; }
    if (status === "confirmed_same" && phoneOnly) return; // hard refusal client-side
    if (!evidenceChecked) return;
    busy.current = true;
    dispatch({ type: "submit" });
    try {
      const res = await fetch(`/api/duplicates/${encodeURIComponent(view.link.id)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, reason: reasonText, profile_evidence_reviewed: true }),
      });
      const body = await readJson(res);
      if (res.ok) {
        const parsed = parseResponse(body);
        if (parsed) dispatch({ type: "decided", response: parsed });
        else dispatch({ type: "failed", failure: translateError(res.status, body, { kind: "uncertain" }) });
      } else {
        dispatch({ type: "failed", failure: translateError(res.status, body, { kind: "generic" }) });
      }
    } catch {
      dispatch({ type: "failed", failure: { kind: "offline" } });
    } finally {
      busy.current = false;
    }
  }

  const scoreLabel = `${localizeDigits(Math.round(view.link.score), locale)} / ${localizeDigits(100, locale)}`;
  const ruleLabel = phoneOnly ? t.duplicateRuleSamePhone as string : t.duplicateRuleProfile as string;

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={`${uid}-score`} className="flex flex-col gap-1">
        <h2 id={`${uid}-score`} className="text-body-sm font-medium text-mute">{t.duplicateScore}</h2>
        <p className="text-heading-2 font-semibold text-ink">{scoreLabel}</p>
        <p className="text-mute text-caption-md [&:lang(bn)]:text-body-sm">
          {t.duplicateScore} · {ruleLabel}
        </p>
        {phoneOnly && (
          <p id={`${uid}-phone-only`} className="mt-2 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-body-sm text-warning-text">
            <CircleAlertIcon className="mt-[0.2em] size-4" />
            <span>{t.duplicateRuleSamePhoneWarn}</span>
          </p>
        )}
        {alreadyResolved && (
          <p className="mt-2 flex items-start gap-2 rounded-md border border-dashed border-hairline-strong px-3 py-2.5 text-body-sm text-body">
            <CircleCheckIcon className="mt-[0.2em] size-4 text-success" />
            <span>{t.duplicateAlreadyResolved}</span>
          </p>
        )}
      </section>

      <div className="hidden min-w-0 overflow-x-auto sm:block" tabIndex={0} role="region" aria-label={t.duplicateCompareField}>
        <table className="w-full border-collapse text-left text-body-sm">
          <caption className="sr-only">{t.duplicateCompareField}</caption>
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className="py-2 pr-3 font-medium text-mute">{t.duplicateCompareField}</th>
              <th scope="col" className="py-2 pr-3 font-medium text-ink">{refLabel(view.cases.a.ref_code)}</th>
              <th scope="col" className="py-2 pr-3 font-medium text-ink">{refLabel(view.cases.b.ref_code)}</th>
              <th scope="col" className="py-2 font-medium text-mute">{t.duplicateCompareResult}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-hairline align-top">
                <th scope="row" className="py-2 pr-3 font-medium text-body">{t[FIELD_KEY[r.key]] as string}</th>
                <td className={`py-2 pr-3 ${r.a === null ? "text-mute" : "text-ink"}`}>{cellText(r.a, r.key, locale, t as { [k: string]: string })}</td>
                <td className={`py-2 pr-3 ${r.b === null ? "text-mute" : "text-ink"}`}>{cellText(r.b, r.key, locale, t as { [k: string]: string })}</td>
                <td className={`py-2 ${verdictTone[r.verdict]}`}>
                  <span>{t[verdictKey[r.verdict]] as string}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-4 sm:hidden">
        {rows.map((r) => (
          <li key={r.key} className="flex flex-col gap-1 border-b border-hairline pb-3 text-body-sm">
            <span className="font-medium text-body">{t[FIELD_KEY[r.key]] as string}</span>
            <span className="text-ink">
              <span className="text-mute">{refLabel(view.cases.a.ref_code)}: </span>{cellText(r.a, r.key, locale, t as { [k: string]: string })}
            </span>
            <span className="text-ink">
              <span className="text-mute">{refLabel(view.cases.b.ref_code)}: </span>{cellText(r.b, r.key, locale, t as { [k: string]: string })}
            </span>
            <span className={`${verdictTone[r.verdict]}`}>{t[verdictKey[r.verdict]] as string}</span>
          </li>
        ))}
      </ul>

      <section aria-labelledby={`${uid}-decision`} className="flex flex-col gap-4 border-t border-hairline pt-6" aria-busy={state.status === "submitting" || undefined}>
        <h2 id={`${uid}-decision`} className="text-body-md font-semibold text-ink">{t.duplicateDetailHeading}</h2>

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
            {t.duplicateReload as string}
          </button>
        )}

        {state.status === "decided" ? (
          <div ref={resultRef} tabIndex={-1} className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-[16px] shadow-1 sm:p-6">
            <p role="status" className="flex items-center gap-2 text-heading-4 font-semibold text-success-text">
              <CircleCheckIcon className="size-5" />
              <span>{t.duplicateDecided as string}</span>
            </p>
            <a href={listHref} className="min-h-11 self-start rounded-md border border-control bg-elevated px-4 py-2.5 text-body-md font-medium text-ink hover:border-control-strong">
              {t.duplicateBack as string}
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <label className="flex min-h-11 items-start gap-3 text-body-sm text-ink">
              <input
                type="checkbox"
                checked={evidenceChecked}
                onChange={(e) => setEvidenceChecked(e.target.checked)}
                className="mt-1 size-5"
                aria-describedby={`${uid}-evidence-required`}
              />
              <span>
                {t.duplicateProfileEvidenceLabel as string}
                <span id={`${uid}-evidence-required`} className="block text-caption-md text-mute [&:lang(bn)]:text-body-sm">
                  {t.duplicateProfileEvidenceRequired as string}
                </span>
              </span>
            </label>

            <div className="flex max-w-[34rem] flex-col gap-2">
              <label htmlFor={`${uid}-reason`} className="text-body-sm font-medium text-ink">{t.duplicateReasonLabel as string}</label>
              <textarea
                ref={reasonRef}
                id={`${uid}-reason`}
                rows={3}
                minLength={3}
                maxLength={500}
                disabled={!decidable}
                onChange={() => {
                  if (state.reasonError) dispatch({ type: "reason", error: null });
                }}
                aria-invalid={state.reasonError ? true : undefined}
                aria-describedby={joinIds(state.reasonError && `${uid}-reason-error`)}
                className="min-h-11 w-full rounded-md border border-control bg-elevated px-3 py-2 text-body-md text-ink hover:border-control-strong focus:border-control-strong aria-invalid:border-danger"
              />
              {state.reasonError && (
                <p id={`${uid}-reason-error`} className="flex items-start gap-1.5 text-danger-text text-caption-md [&:lang(bn)]:text-body-sm">
                  <CircleAlertIcon className="mt-[0.2em] size-3.5" />
                  <span>{state.reasonError === "required" ? t.duplicateReasonRequired as string : t.duplicateReasonLength as string}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => send("confirmed_same")}
                disabled={!decidable || phoneOnly}
                aria-disabled={!decidable || phoneOnly || undefined}
                aria-describedby={phoneOnly ? `${uid}-phone-only` : undefined}
                title={phoneOnly ? (t.duplicateSamePhoneCannotConfirm as string) : undefined}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-5 text-body-md font-semibold text-on-primary hover:bg-primary-pressed disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.status === "submitting" && <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />}
                <span>{state.status === "submitting" ? (t.duplicateSubmitting as string) : (t.duplicateConfirmSame as string)}</span>
              </button>
              <button
                type="button"
                onClick={() => send("dismissed")}
                disabled={!decidable}
                aria-disabled={!decidable || undefined}
                className="min-h-11 rounded-md border border-control bg-elevated px-5 text-body-md font-medium text-ink hover:border-control-strong disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{t.duplicateDismiss as string}</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
