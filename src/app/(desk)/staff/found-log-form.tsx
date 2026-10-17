"use client";

// COMP-034 found-child form (SCREEN-007, ACT-019 → API-007). Logic, API call and copy are
// pure helpers (src/lib/found-log-flow.ts); this file wires them to the DOM.
//
// - Inputs are uncontrolled and read from FormData at Save, so autofill counts.
// - Save is the confirmation (ACT-019); the request is built and validated by the frozen
//   contract before anything is sent. No photo, no coordinates, no candidate details.
// - aria-disabled (not disabled) while saving, plus a synchronous guard against a second
//   press, released in a finally. The same client UUID is reused only for the same payload
//   (a safe replay); an edited retry gets a new one (src/lib/found-log-flow.ts).
// - One stable role=alert region; its message element is re-created per attempt so a repeated
//   identical failure is announced again. After a failed Save the validation error is linked
//   to the first invalid field and focus moves there after the render commits.
import { useEffect, useId, useReducer, useRef, useState, type FormEvent } from "react";
import { CircleAlertIcon, CircleCheckIcon, ClockIcon, InfoIcon, LoaderCircleIcon } from "@/app/components/icons";
import {
  SEX_OPTIONS,
  buildFoundRequest,
  createSaveGuard,
  dhakaLocalInput,
  firstErrorField,
  foundLogFailureText,
  foundLogFieldText,
  foundLogMatchText,
  foundLogReducer,
  initialFoundLogState,
  newClientId,
  requestFoundLog,
  submissionFor,
  valuesFromFormData,
  type FoundLogField,
  type SubmissionMemo,
} from "@/lib/found-log-flow";
import { locales, type Locale, type MessageKey } from "@/locales";

export type DistrictOption = { code: number; name_en: string; name_bn: string };

const CAPTION = "text-caption-md [&:lang(bn)]:text-body-sm";
const SEX_KEY: Record<(typeof SEX_OPTIONS)[number], MessageKey> = {
  unknown: "foundLogSexUnknown",
  male: "foundLogSexMale",
  female: "foundLogSexFemale",
  other: "foundLogSexOther",
};

const control = [
  "min-h-11 w-full min-w-0 rounded-md border border-control bg-elevated px-3 text-body-md text-ink",
  "transition-colors duration-(--duration-fast) ease-out",
  "hover:border-control-strong focus:border-control-strong focus:shadow-1",
  "aria-invalid:border-danger",
].join(" ");
const textarea = `${control} py-2 leading-relaxed`;

const joinIds = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ") || undefined;
const WARN_KINDS = new Set(["rate-limited", "offline", "uncertain", "conflict"]);

// `districts` arrives already sorted for the locale (server), so server and client agree.
export function FoundLogForm({ locale, districts }: { locale: Locale; districts: readonly DistrictOption[] }) {
  const t = locales[locale];
  const uid = useId();
  const [state, dispatch] = useReducer(foundLogReducer, initialFoundLogState);
  const [formKey, setFormKey] = useState(0);
  const guard = useRef<ReturnType<typeof createSaveGuard> | null>(null);
  guard.current ??= createSaveGuard();
  const memo = useRef<SubmissionMemo>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const savedRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FoundLogField | null>(null);

  // The time defaults to now in Dhaka time; set after mount so server and client markup agree.
  useEffect(() => {
    const el = formRef.current?.elements.namedItem("foundAt");
    if (el instanceof HTMLInputElement && el.value === "") el.value = dhakaLocalInput(Date.now());
  }, [formKey]);

  // Focus follows the committed render: the first invalid field (so its error is announced
  // with the field), the success panel, or the first field of a fresh form.
  useEffect(() => {
    if (state.status === "saved") {
      savedRef.current?.focus();
      return;
    }
    const field = pendingFocus.current;
    if (field) {
      pendingFocus.current = null;
      const el = formRef.current?.elements.namedItem(field);
      if (el instanceof HTMLElement) el.focus();
    }
  }, [state.attempt, state.status]);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      guard.current?.leave();
      dispatch({ type: "interrupted" });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const saving = state.status === "saving";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const g = guard.current;
    if (!g || g.busy) return;
    const now = Date.now();
    const values = valuesFromFormData(new FormData(event.currentTarget), now);
    const plan = submissionFor(memo.current, values, newClientId);
    const built = buildFoundRequest(values, { clientSubmissionId: plan.id, nowMs: now });
    if (!built.ok) {
      if (built.unmapped) {
        // A contract rule no form field owns: not the staff's typing. Paths only, never values.
        console.error("found-log: request rejected by the contract", built.unmapped);
        dispatch({ type: "outcome", outcome: { kind: "failure", failure: { kind: "generic" } } });
        return;
      }
      pendingFocus.current = firstErrorField(built.fields);
      dispatch({ type: "invalid", fields: built.fields });
      return;
    }
    if (!g.enter()) return;
    memo.current = plan;
    dispatch({ type: "save" });
    try {
      const outcome = await requestFoundLog(built.request);
      if (outcome.kind === "saved" || (outcome.kind === "failure" && outcome.failure.kind === "conflict")) {
        memo.current = null; // next child, or a changed payload: a new submission
      }
      dispatch({ type: "outcome", outcome });
    } catch {
      dispatch({ type: "outcome", outcome: { kind: "failure", failure: { kind: "uncertain" } } });
    } finally {
      g.leave();
    }
  }

  function another() {
    pendingFocus.current = "circumstances";
    dispatch({ type: "another" });
    setFormKey((k) => k + 1);
  }

  const fieldError = (field: FoundLogField) => {
    const reason = state.fields[field];
    if (!reason) return null;
    return (
      <p id={`${uid}-${field}-error`} className={`flex items-start gap-1.5 text-danger-text ${CAPTION}`}>
        <CircleAlertIcon className="mt-[0.2em] size-3.5" />
        <span>{foundLogFieldText(reason, locale)}</span>
      </p>
    );
  };
  const describe = (field: FoundLogField, hint?: boolean) =>
    joinIds(state.fields[field] && `${uid}-${field}-error`, hint && `${uid}-${field}-hint`);
  const invalid = (field: FoundLogField) => (state.fields[field] ? true : undefined);
  const onInput = (field: FoundLogField) => () => dispatch({ type: "input", field });

  if (state.status === "saved" && state.saved) {
    const saved = state.saved;
    const MatchIcon = saved.matching_state === "failed" ? CircleAlertIcon : saved.matching_state === "complete" ? CircleCheckIcon : ClockIcon;
    return (
      <div className="flex flex-col gap-5">
        <div
          ref={savedRef}
          tabIndex={-1}
          aria-labelledby={`${uid}-saved-title`}
          className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface p-[16px] shadow-1 sm:p-6"
        >
          <p id={`${uid}-saved-title`} role="status" className="flex items-center gap-2 text-heading-4 font-semibold text-success-text">
            <CircleCheckIcon className="size-5" />
            <span>{t.foundLogSavedTitle}</span>
          </p>
          <p className="text-body-md text-ink">
            <span className="text-mute">{t.foundLogRefLabel}: </span>
            <span lang="en" translate="no" className="font-mono text-ink">{saved.ref_code}</span>
          </p>
          <p className="flex items-start gap-2 text-body-md text-body">
            <MatchIcon className="mt-[0.3em] size-4" />
            <span>{foundLogMatchText(saved.matching_state, locale)}</span>
          </p>
          {saved.replayed && (
            <p className="flex items-start gap-2 text-body-sm text-mute">
              <InfoIcon className="mt-[0.2em] size-4 text-info" />
              <span>{t.foundLogReplayed}</span>
            </p>
          )}
          <p className={`text-mute ${CAPTION}`}>{t.foundLogOfficerOnly}</p>
        </div>
        <button
          type="button"
          onClick={another}
          className="min-h-11 self-start rounded-md border border-control bg-elevated px-4 text-body-md font-medium text-ink hover:border-control-strong"
        >
          {t.foundLogAnother}
        </button>
      </div>
    );
  }

  const label = (field: FoundLogField, key: MessageKey, optional = false) => (
    <label htmlFor={`${uid}-${field}`} className="text-body-sm font-medium text-ink">
      {t[key]}
      {optional && <span className="font-normal text-mute"> · {t.foundLogOptional}</span>}
    </label>
  );
  const group = "flex min-w-0 flex-col gap-4 border-0 p-0";
  const legend = "mb-1 text-body-md font-semibold text-ink";
  const other = (d: DistrictOption) => (locale === "bn" ? d.name_en : d.name_bn);
  const failure = state.failure;
  const hasFieldErrors = Object.keys(state.fields).length > 0;

  return (
    <form
      key={formKey}
      ref={formRef}
      method="post"
      noValidate
      aria-label={t.foundLogTitle}
      aria-busy={saving || undefined}
      onSubmit={onSubmit}
      className="flex flex-col gap-8"
    >
      <fieldset className={group}>
        <legend className={legend}>{t.foundLogGroupChild}</legend>

        <div className="flex flex-col gap-1.5">
          {label("circumstances", "foundLogCircumstances")}
          <textarea
            id={`${uid}-circumstances`} name="circumstances" rows={3} maxLength={500}
            aria-invalid={invalid("circumstances")} aria-describedby={describe("circumstances")}
            onInput={onInput("circumstances")} className={textarea}
          />
          {fieldError("circumstances")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            {label("clothing", "foundLogClothing", true)}
            <input id={`${uid}-clothing`} name="clothing" type="text" maxLength={300} autoComplete="off"
              aria-invalid={invalid("clothing")} aria-describedby={describe("clothing")} onInput={onInput("clothing")} className={control} />
            {fieldError("clothing")}
          </div>
          <div className="flex flex-col gap-1.5">
            {label("marks", "foundLogMarks", true)}
            <input id={`${uid}-marks`} name="marks" type="text" maxLength={300} autoComplete="off"
              aria-invalid={invalid("marks")} aria-describedby={describe("marks")} onInput={onInput("marks")} className={control} />
            {fieldError("marks")}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            {label("sex", "foundLogSex")}
            <select id={`${uid}-sex`} name="sex" defaultValue="unknown" aria-invalid={invalid("sex")} aria-describedby={describe("sex")} className={control}>
              {SEX_OPTIONS.map((s) => (
                <option key={s} value={s}>{t[SEX_KEY[s]]}</option>
              ))}
            </select>
            {fieldError("sex")}
          </div>
          <div className="flex flex-col gap-1.5">
            {label("ageYears", "foundLogAgeYears", true)}
            <input id={`${uid}-ageYears`} name="ageYears" type="text" inputMode="numeric" maxLength={2} autoComplete="off"
              aria-invalid={invalid("ageYears")} aria-describedby={describe("ageYears")} onInput={onInput("ageYears")} className={control} />
            {fieldError("ageYears")}
          </div>
          <div className="flex flex-col gap-1.5">
            {label("heightCm", "foundLogHeight", true)}
            <input id={`${uid}-heightCm`} name="heightCm" type="text" inputMode="numeric" maxLength={3} autoComplete="off"
              aria-invalid={invalid("heightCm")} aria-describedby={describe("heightCm")} onInput={onInput("heightCm")} className={control} />
            {fieldError("heightCm")}
          </div>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="text-body-sm font-medium text-ink">
            {t.foundLogAgeRangeLegend}
            <span className="font-normal text-mute"> · {t.foundLogOptional}</span>
          </legend>
          <div className="grid grid-cols-1 gap-4 min-[26rem]:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              {label("ageMin", "foundLogAgeMin")}
              <input id={`${uid}-ageMin`} name="ageMin" type="text" inputMode="numeric" maxLength={2} autoComplete="off"
                aria-invalid={invalid("ageMin")} aria-describedby={describe("ageMin")} onInput={onInput("ageMin")} className={control} />
              {fieldError("ageMin")}
            </div>
            <div className="flex flex-col gap-1.5">
              {label("ageMax", "foundLogAgeMax")}
              <input id={`${uid}-ageMax`} name="ageMax" type="text" inputMode="numeric" maxLength={2} autoComplete="off"
                aria-invalid={invalid("ageMax")} aria-describedby={describe("ageMax")} onInput={onInput("ageMax")} className={control} />
              {fieldError("ageMax")}
            </div>
          </div>
        </fieldset>
      </fieldset>

      <fieldset className={group}>
        <legend className={legend}>{t.foundLogGroupFound}</legend>

        <div className="flex flex-col gap-1.5">
          {label("place", "foundLogPlace")}
          <input id={`${uid}-place`} name="place" type="text" maxLength={200} autoComplete="off" aria-required="true"
            aria-invalid={invalid("place")} aria-describedby={describe("place")} onInput={onInput("place")} className={control} />
          {fieldError("place")}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            {label("district", "foundLogDistrict")}
            <select id={`${uid}-district`} name="district" defaultValue="" aria-required="true"
              aria-invalid={invalid("district")} aria-describedby={describe("district")} onChange={onInput("district")} className={control}>
              <option value="">{t.foundLogDistrictPlaceholder}</option>
              {districts.map((d) => (
                <option key={d.code} value={d.code}>
                  {locale === "bn" ? d.name_bn : d.name_en} ({other(d)})
                </option>
              ))}
            </select>
            {fieldError("district")}
          </div>
          <div className="flex flex-col gap-1.5">
            {label("thana", "foundLogThana", true)}
            <input id={`${uid}-thana`} name="thana" type="text" maxLength={80} autoComplete="off"
              aria-invalid={invalid("thana")} aria-describedby={describe("thana")} onInput={onInput("thana")} className={control} />
            {fieldError("thana")}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:max-w-[16rem]">
          {label("foundAt", "foundLogFoundAt")}
          <input id={`${uid}-foundAt`} name="foundAt" type="datetime-local" step={60} aria-required="true"
            aria-invalid={invalid("foundAt")} aria-describedby={describe("foundAt", true)} onInput={onInput("foundAt")} className={control} />
          <p id={`${uid}-foundAt-hint`} className={`text-mute ${CAPTION}`}>{t.foundLogFoundAtHint}</p>
          {fieldError("foundAt")}
        </div>
      </fieldset>

      <fieldset className={group}>
        <legend className={legend}>{t.foundLogGroupContact}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            {label("phone", "foundLogPhone")}
            <input id={`${uid}-phone`} name="phone" type="tel" inputMode="tel" maxLength={32} autoComplete="off" aria-required="true"
              aria-invalid={invalid("phone")} aria-describedby={describe("phone", true)} onInput={onInput("phone")} className={control} />
            <p id={`${uid}-phone-hint`} className={`text-mute ${CAPTION}`}>{t.foundLogPhoneHint}</p>
            {fieldError("phone")}
          </div>
          <div className="flex flex-col gap-1.5">
            {label("relation", "foundLogRelation", true)}
            <input id={`${uid}-relation`} name="relation" type="text" maxLength={40} autoComplete="off"
              aria-invalid={invalid("relation")} aria-describedby={describe("relation")} onInput={onInput("relation")} className={control} />
            {fieldError("relation")}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3 border-t border-hairline pt-5">
        {/* Right above Save so a server failure appears at the focus point. The region is
            always mounted; only its message element is re-created per attempt. */}
        <div role="alert" aria-atomic="true">
          {failure && (
            <p
              key={state.attempt}
              className={[
                "flex items-start gap-2 rounded-md px-3 py-2.5 text-body-sm",
                WARN_KINDS.has(failure.kind) ? "bg-warning-soft text-warning-text" : "bg-danger-soft text-danger-text",
              ].join(" ")}
            >
              {failure.kind === "rate-limited" || failure.kind === "offline" ? (
                <ClockIcon className="mt-[0.2em] size-4" />
              ) : (
                <CircleAlertIcon className="mt-[0.2em] size-4" />
              )}
              <span>{foundLogFailureText(failure, locale)}</span>
            </p>
          )}
        </div>
        {!failure && hasFieldErrors && (
          <p className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-body-sm text-danger-text">
            <CircleAlertIcon className="mt-[0.2em] size-4" />
            <span>{t.foundLogErrorValidation}</span>
          </p>
        )}
        <button
          type="submit"
          aria-disabled={saving || undefined}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md bg-primary px-5 text-body-md font-semibold text-on-primary hover:bg-primary-pressed aria-disabled:cursor-progress aria-disabled:opacity-80"
        >
          {saving && <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" />}
          <span>{saving ? t.foundLogSaving : t.foundLogSave}</span>
        </button>
        <p className="sr-only" role="status" aria-live="polite">{saving ? t.foundLogSaving : ""}</p>
      </div>
    </form>
  );
}
