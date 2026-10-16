"use client";

import { useState } from "react";
import { DRAFT_FIELD_PATHS, type DraftFieldPath } from "@/contracts";
import { FIELD_LABEL, textLang } from "@/lib/intake/draft-summary";
import { fieldValue, NUMBER_FIELDS, TIME_FIELDS, PART_OF_DAY_RANGES, partOfDayEdits, type PartOfDay } from "@/lib/intake/review";
import type { DeviceDraft } from "@/lib/intake/draft-store";
import { localizeDigits, toLatinDigits } from "@/lib/numerals";
import { locales, type Locale, type MessageKey } from "@/locales";
import { CircleAlertIcon, InfoIcon } from "@/app/components/icons";
import { CircleCheckIcon, HonestLabel, PRIMARY_BUTTON } from "../../parent-ui";

const LABELS: Partial<Record<DraftFieldPath, MessageKey>> = {
  "child.age_min": "reviewAgeMin", "child.age_max": "reviewAgeMax",
  "event.at_lower": "reviewTimeLower", "event.at_upper": "reviewTimeUpper", "event.district_code": "reviewDistrictCode",
};
export function reviewLabel(path: DraftFieldPath, locale: Locale): string {
  return locales[locale][LABELS[path] ?? FIELD_LABEL[path]];
}
export function fieldError(path: DraftFieldPath, locale: Locale): string {
  const t = locales[locale];
  return path.startsWith("child.age") ? t.reviewAgeInvalid : path === "reporter.phone" ? t.reviewPhoneInvalid
    : TIME_FIELDS.has(path) ? t.reviewTimeInvalid : t.reviewFieldInvalid;
}
const ALWAYS_REQUIRED = new Set<DraftFieldPath>(["event.at", "event.at_lower", "event.at_upper", "event.place_text", "event.district_code", "reporter.phone"]);
const INPUT = "min-h-11 w-full min-w-0 rounded-md border border-control bg-elevated px-3 py-2 text-body-lg text-ink hover:border-control-strong focus:border-control-strong disabled:bg-card disabled:text-body";

function FieldSpan({ record, span, locale }: { record: DeviceDraft; span: { start_utf16: number; end_utf16: number } | undefined; locale: Locale }) {
  const t = locales[locale];
  const text = record.draft.source_text;
  return <>
    <p data-source="full" lang={textLang(text)} className="whitespace-pre-wrap break-words text-body-lg text-body">
      {span ? <>{text.slice(0, span.start_utf16)}<mark className="rounded-xs bg-info-soft text-ink">{text.slice(span.start_utf16, span.end_utf16)}</mark>{text.slice(span.end_utf16)}</> : text}
    </p>
    {!span && <p className="text-body-lg text-body">{t.reviewNoSpan}</p>}
  </>;
}

export function ReviewFields({ record, locale, errors, onEdit, onApprox, onBatch, onBlur, locked }: {
  record: DeviceDraft; locale: Locale; errors: readonly DraftFieldPath[];
  onEdit: (path: DraftFieldPath, value: string) => void; onApprox: (value: boolean) => void;
  onBatch: (edits: Partial<Record<DraftFieldPath, string>>, approximate?: boolean) => void;
  onBlur: (path: DraftFieldPath) => void; locked: boolean;
}) {
  const t = locales[locale];
  const [ageMode, setAgeMode] = useState(() => fieldValue(record, "child.age_years") ? "exact" : fieldValue(record, "child.age_min") || fieldValue(record, "child.age_max") ? "estimate" : "exact");
  const [date, setDate] = useState(() => fieldValue(record, "event.at").slice(0, 10));
  const [dateChanged, setDateChanged] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const [futureClamped, setFutureClamped] = useState(false);
  const [part, setPart] = useState<PartOfDay | null>(null);
  function batch(edits: Partial<Record<DraftFieldPath, string>>, approximate?: boolean) {
    onBatch(edits, approximate);
  }
  function applyPart(nextDate: string, nextPart: PartOfDay | null, now: number) {
    if (!nextPart) return;
    const edits = partOfDayEdits(nextDate, nextPart, now);
    setFutureClamped(Boolean(edits && nextPart === "night" && new Date(`${toLatinDigits(nextDate).trim()}T06:00:00+06:00`).getTime() + 86_400_000 > now));
    if (edits) batch(edits, true);
  }
  // D4 §9: sourced values follow the parent's speaking order; unknowns follow them.
  // Impeccable: age card merges age_years / age_min / age_max; at card merges at / at_lower / at_upper;
  // the rest of the fields remain one card each.
  type Card =
    | { kind: "single"; path: DraftFieldPath }
    | { kind: "age" }
    | { kind: "time" };
  const cards: Card[] = [];
  const seen = new Set<DraftFieldPath>();
  for (const path of [...DRAFT_FIELD_PATHS].sort((a, b) => (record.draft.evidence[a]?.start_utf16 ?? Infinity) - (record.draft.evidence[b]?.start_utf16 ?? Infinity))) {
    if (path === "child.age_years" || path === "child.age_min" || path === "child.age_max") {
      if (!seen.has("child.age_years") && !seen.has("child.age_min") && !seen.has("child.age_max")) {
        cards.push({ kind: "age" });
        seen.add("child.age_years"); seen.add("child.age_min"); seen.add("child.age_max");
      }
      continue;
    }
    if (path === "event.at" || path === "event.at_lower" || path === "event.at_upper") {
      if (!seen.has("event.at") && !seen.has("event.at_lower") && !seen.has("event.at_upper")) {
        cards.push({ kind: "time" });
        seen.add("event.at"); seen.add("event.at_lower"); seen.add("event.at_upper");
      }
      continue;
    }
    if (path === "event.district_text") continue; // not shown on the review screen (catalogue renders name)
    cards.push({ kind: "single", path });
  }

  function source(path: DraftFieldPath) {
    const edited = Object.hasOwn(record.edits, path);
    if (!edited && fieldValue(record, path) === "") return null;
    return edited ? <p className="mt-3 flex items-center gap-2 text-body-lg text-success-text"><CircleCheckIcon />{t.reviewEdited}</p>
      : <div data-field-source={path} className="mt-3 border-t border-hairline pt-3">
        <p className="mb-1 text-body-lg font-medium text-body">{t.reviewSource}</p>
        <FieldSpan record={record} span={record.draft.evidence[path]} locale={locale} />
      </div>;
  }
  function groupedInput(path: DraftFieldPath, hint: string) {
    const id = `review-${path}`;
    const invalid = errors.includes(path) || (path.startsWith("child.age_") && (ageMode === "exact" ? errors.some(field => field.startsWith("child.age_")) : errors.includes("child.age_years")));
    return <div key={path} className="min-w-0">
      <label htmlFor={id} className="text-body-lg text-body">{reviewLabel(path, locale)}</label>
      {fieldValue(record, path) === "" && <p className="mt-1 text-body-lg text-body">{t.reviewUnknownAdd}</p>}
      <input id={id} disabled={locked} className={INPUT} type="text" inputMode={NUMBER_FIELDS.has(path) ? "numeric" : "text"}
        value={localizeDigits(fieldValue(record, path), locale)} aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ""}`} onBlur={() => onBlur(path)} onChange={(e) => path === "child.age_years"
          ? batch({ "child.age_years": e.target.value, "child.age_min": "", "child.age_max": "" })
          : onEdit(path, e.target.value)} />
      <p id={`${id}-hint`} className="mt-2 break-words text-body-lg text-body">{hint}</p>
      {invalid && <p id={`${id}-error`} className="mt-2 flex items-start gap-2 text-body-lg text-body"><CircleAlertIcon className="mt-1 size-5 text-info" />{fieldError(path, locale)}</p>}
      {source(path)}
    </div>;
  }
  function timeInput(path: DraftFieldPath, hint: string) {
    const id = `review-${path}`;
    const invalid = errors.includes(path);
    const value = fieldValue(record, path);
    const [day = "", clock = ""] = value.split("T");
    // Strip only the serialized seconds/offset; preserve partial typed HH:mm.
    const time = clock.replace(/:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, "");
    function update(nextDate: string, nextTime: string) {
      setFutureClamped(false);
      onEdit(path, !nextDate && !nextTime ? "" : `${toLatinDigits(nextDate)}T${toLatinDigits(nextTime)}:00+06:00`);
    }
    const describedBy = `${id}-hint${invalid ? ` ${id}-error` : ""}`;
    return <fieldset className="min-w-0 border-0 p-0" disabled={locked}>
      <legend className="text-body-lg font-medium text-ink">{reviewLabel(path, locale)}</legend>
      {!value && <p className="text-body-lg text-body">{t.reviewUnknownAdd}</p>}
      <label htmlFor={id} className="block text-body-lg text-body">{t.timeDateLabel}</label>
      <textarea id={id} rows={1} disabled={locked} className={`${INPUT} resize-none [field-sizing:content]`} value={localizeDigits(day, locale)}
        aria-required aria-invalid={invalid || undefined} aria-describedby={describedBy} onBlur={() => onBlur(path)}
        onChange={e => update(e.target.value, time)} />
      <label htmlFor={`${id}-time`} className="block text-body-lg text-body">{t.reviewClockLabel}</label>
      <input id={`${id}-time`} disabled={locked} type="text" inputMode="text" className={INPUT} value={localizeDigits(time, locale)}
        aria-required aria-invalid={invalid || undefined} aria-describedby={describedBy} onBlur={() => onBlur(path)}
        onChange={e => update(day, e.target.value)} />
      <p id={`${id}-hint`} className="mt-2 break-words text-body-lg text-body">{hint}</p>
      {invalid && <p id={`${id}-error`} className="mt-2 flex items-start gap-2 text-body-lg text-body"><CircleAlertIcon className="mt-1 size-5 text-info" />{fieldError(path, locale)}</p>}
      {source(path)}
    </fieldset>;
  }
  function renderAge() {
    return <section className="min-w-0 rounded-lg border border-hairline bg-surface p-4 shadow-1" aria-labelledby="review-age-label">
      <p id="review-age-label" className="text-body-lg font-semibold text-ink">{t.fieldAge}</p>
      <fieldset disabled={locked} className="mt-2 flex flex-col gap-2 border-0 p-0">
        <legend className="text-body-lg text-body">{t.reviewAgeMode}</legend>
        {(["exact", "estimate"] as const).map(mode => <label key={mode} className="flex min-h-11 items-center gap-3 text-body-lg text-body">
          <input id={`review-age-${mode}`} type="radio" name="review-age-mode" className="size-5 accent-primary" checked={ageMode === mode}
            onChange={() => { setAgeMode(mode); batch(mode === "estimate" ? { "child.age_years": "" } : { "child.age_min": "", "child.age_max": "" }); }} />
          {mode === "exact" ? t.ageExact : t.reviewAgeEstimate}
        </label>)}
      </fieldset>
      <div className="mt-2 flex flex-col gap-3">
        {ageMode === "exact" ? groupedInput("child.age_years", t.reviewAgeExactHint) : <>
          {groupedInput("child.age_min", t.reviewAgeRangeHint)}
          {groupedInput("child.age_max", t.reviewAgeRangeHint)}
        </>}
      </div>
    </section>;
  }
  function renderTime() {
    const dateInvalid = dateTouched && date.trim() !== "" && partOfDayEdits(date, "morning", 0) === null;
    return <section className="min-w-0 rounded-lg border border-hairline bg-surface p-4 shadow-1" aria-labelledby="review-time-label">
      <p id="review-time-label" className="text-body-lg font-semibold text-ink">{t.fieldLastSeenAt}</p>
      <div className="mt-2 flex flex-col gap-3">
        <label htmlFor="review-event.date" className="text-body-lg text-body">{t.timeDateLabel}</label>
        <textarea id="review-event.date" rows={1} disabled={locked} className={`${INPUT} resize-none [field-sizing:content]`} value={localizeDigits(date, locale)}
          aria-invalid={dateInvalid || undefined} aria-describedby={`review-date-hint${dateInvalid ? " review-date-error" : ""}`}
          onBlur={() => setDateTouched(true)} onChange={e => { setDate(e.target.value); setDateChanged(true); applyPart(e.target.value, part, Date.now()); }} />
        <p id="review-date-hint" className="text-body-lg text-body">{t.reviewDateHint}</p>
        {dateChanged && !part && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewDateNotApplied}</p>}
        {dateInvalid && <p id="review-date-error" className="flex items-start gap-2 text-body-lg text-body"><CircleAlertIcon className="mt-1 size-5 text-info" />{t.reviewDateInvalid}</p>}
        <fieldset disabled={locked} className="flex flex-wrap gap-2 border-0 p-0">
          <legend className="text-body-lg text-body">{t.timePartLabel}</legend>
          {(Object.keys(PART_OF_DAY_RANGES) as PartOfDay[]).map(value => <label key={value} className="flex min-h-11 items-center gap-2 rounded-md border border-control px-3 text-body-lg text-body">
            <input id={`review-event.part-${value}`} type="radio" name="review-event.part" value={value} checked={part === value} className="size-5 accent-primary"
              onChange={() => { setPart(value); applyPart(date, value, Date.now()); }} />
            {t[({ morning: "timePartMorning", midday: "timePartMidday", afternoon: "timePartAfternoon", evening: "timePartEvening", night: "timePartNight" } as const)[value]]}
          </label>)}
        </fieldset>
        {futureClamped && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewFutureClamped}</p>}
        {timeInput("event.at", t.reviewTimeHint)}
        {timeInput("event.at_lower", t.reviewTimeBoundHint)}
        {timeInput("event.at_upper", t.reviewTimeBoundHint)}
      </div>
      <label className="mt-3 flex min-h-11 items-center gap-3 text-body-lg text-body">
        <input type="checkbox" className="size-6 accent-primary" checked={record.approximate} disabled={locked} onBlur={() => onBlur("event.at")} onChange={(e) => onApprox(e.target.checked)} />{t.reviewApprox}
      </label>
    </section>;
  }

  function renderSingle(path: DraftFieldPath) {
    const id = `review-${path}`;
    const value = fieldValue(record, path);
    const edited = Object.hasOwn(record.edits, path);
    const span = edited ? undefined : record.draft.evidence[path];
    const invalid = errors.includes(path);
    const required = ALWAYS_REQUIRED.has(path);
    const hint = path === "event.district_code" ? t.reviewDistrictHint : null;
    const descriptions = [invalid ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
    return <section key={path} className="min-w-0 rounded-lg border border-hairline bg-surface p-4 shadow-1">
      <label id={`${id}-label`} htmlFor={id} className="flex flex-wrap items-baseline gap-x-2 text-body-lg font-semibold text-ink"><span>{reviewLabel(path, locale)}</span>{path === "event.district_code" && <HonestLabel lang="en">{t.mockLabel}</HonestLabel>}{required && <span className="text-body-md font-normal text-body">{t.reviewRequired}</span>}</label>
      {value === "" && path !== "child.sex" && <p className="mt-1 text-body-lg text-body">{t.reviewUnknownAdd}</p>}
      {path === "child.sex" ? <fieldset disabled={locked} aria-labelledby={`${id}-label`} aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={descriptions} className="flex flex-col gap-2 border-0 p-0">
        {([["", t.reviewUnknownAdd], ["male", t.sexMale], ["female", t.sexFemale], ["other", t.sexOther]] as const).map(([v, label]) => (
          <label key={v} className="flex min-h-11 items-center gap-3 text-body-lg text-body">
            <input id={v === "" ? id : `${id}-${v}`} type="radio" name={id} value={v} checked={value === v} onBlur={() => onBlur(path)} onChange={() => onEdit(path, v)} className="size-5 accent-primary" />{label}
          </label>
        ))}
      </fieldset> : <textarea id={id} rows={1} disabled={locked} className={`${INPUT} resize-none [field-sizing:content]`} autoComplete={path === "reporter.phone" ? "tel" : "off"}
        inputMode={NUMBER_FIELDS.has(path) ? "numeric" : path === "reporter.phone" ? "tel" : "text"}
        lang={textLang(value)} value={NUMBER_FIELDS.has(path) || TIME_FIELDS.has(path) || path === "reporter.phone" ? localizeDigits(value, locale) : value}
        aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={descriptions}
        onBlur={() => onBlur(path)} onChange={(e) => onEdit(path, e.target.value)} />}
      {hint && <p id={`${id}-hint`} className="mt-2 break-words text-body-lg text-body">{hint}</p>}
      {invalid && <p id={`${id}-error`} className="mt-2 flex items-start gap-2 text-body-lg text-body"><CircleAlertIcon className="mt-1 size-5 text-info" />{fieldError(path, locale)}</p>}
      {edited ? <p className="mt-3 flex items-center gap-2 text-body-lg text-success-text"><CircleCheckIcon />{t.reviewEdited}</p> : value !== "" && <div data-field-source={path} className="mt-3 border-t border-hairline pt-3">
        <p className="mb-1 text-body-lg font-medium text-body">{t.reviewSource}</p>
        <FieldSpan record={record} span={span} locale={locale} />
      </div>}
    </section>;
  }

  const hasExtraSource = record.sourceText !== record.draft.source_text;
  return <div className="flex flex-col gap-4">
    {cards.map((card) => card.kind === "age" ? <div key="age">{renderAge()}</div> : card.kind === "time" ? <div key="time">{renderTime()}</div> : <div key={card.path}>{renderSingle(card.path)}</div>)}
    {hasExtraSource && <section className="rounded-lg border border-hairline bg-card p-4">
      <p className="mb-1 text-body-lg font-medium text-body">{t.reviewExtraSource}</p>
      <p lang={textLang(record.sourceText)} className="whitespace-pre-wrap break-words text-body-lg text-body">{record.sourceText}</p>
    </section>}
  </div>;
}

export function ConfirmBar({ locale, checked, valid, busy, blocked, mock, describedBy, onCheck }: {
  locale: Locale; checked: boolean; valid: boolean; busy: boolean; blocked: boolean; mock?: boolean; describedBy?: string; onCheck: (checked: boolean) => void;
}) {
  const t = locales[locale];
  const mockDisabled = mock === true;
  return <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-4">
    <label className="flex min-h-11 items-center gap-3 text-body-lg text-ink">
      <input type="checkbox" className="size-6 accent-primary" checked={checked} disabled={busy || blocked} onChange={(e) => onCheck(e.target.checked)} />{t.reviewChecked}
    </label>
    {mockDisabled && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewMockSubmit}</p>}
    <button type="submit" aria-describedby={describedBy} disabled={!checked || !valid || busy || blocked || mockDisabled} aria-disabled={!checked || !valid || busy || blocked || mockDisabled} className={PRIMARY_BUTTON}>{busy ? t.reviewSubmitting : mockDisabled ? t.reviewMockSubmitButton : t.reviewSubmit}</button>
  </div>;
}
