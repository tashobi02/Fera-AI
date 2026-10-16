"use client";

import { DRAFT_FIELD_PATHS, type DraftFieldPath } from "@/contracts";
import { FIELD_LABEL, textLang } from "@/lib/intake/draft-summary";
import { fieldValue, NUMBER_FIELDS, TIME_FIELDS } from "@/lib/intake/review";
import type { DeviceDraft } from "@/lib/intake/draft-store";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale, type MessageKey } from "@/locales";
import { CircleAlertIcon } from "@/app/components/icons";
import { CircleCheckIcon, PRIMARY_BUTTON } from "../../parent-ui";

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

export function ReviewFields({ record, locale, errors, onEdit, onApprox, onBlur, locked }: {
  record: DeviceDraft; locale: Locale; errors: readonly DraftFieldPath[];
  onEdit: (path: DraftFieldPath, value: string) => void; onApprox: (value: boolean) => void;
  onBlur: (path: DraftFieldPath) => void; locked: boolean;
}) {
  const t = locales[locale];
  // D4 §9: sourced values follow the parent's speaking order; unknowns follow them.
  const paths = [...DRAFT_FIELD_PATHS].sort((a, b) => (record.draft.evidence[a]?.start_utf16 ?? Infinity) - (record.draft.evidence[b]?.start_utf16 ?? Infinity));
  return <div className="flex flex-col gap-4">
    {paths.map((path) => {
      const id = `review-${path}`;
      const value = fieldValue(record, path);
      const edited = Object.hasOwn(record.edits, path);
      const span = edited ? undefined : record.draft.evidence[path];
      const invalid = errors.includes(path);
      const exactAge = fieldValue(record, "child.age_years") !== "";
      const rangeAge = fieldValue(record, "child.age_min") !== "" && fieldValue(record, "child.age_max") !== "";
      const anyRange = fieldValue(record, "child.age_min") !== "" || fieldValue(record, "child.age_max") !== "";
      const required = ALWAYS_REQUIRED.has(path) || (path === "child.age_years" && exactAge && !rangeAge)
        || ((path === "child.age_min" || path === "child.age_max") && !exactAge && anyRange);
      const hint = path.startsWith("child.age") ? t.reviewAgeHint : TIME_FIELDS.has(path) ? t.reviewTimeHint : path === "event.district_code" ? t.reviewDistrictHint : null;
      const descriptions = [invalid ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
      const common = { id, disabled: locked, className: INPUT, "aria-required": required || undefined, "aria-invalid": invalid || undefined, "aria-describedby": descriptions, onBlur: () => onBlur(path) };
      return <section key={path} className="min-w-0 rounded-lg border border-hairline bg-surface p-4 shadow-1">
        <label htmlFor={id} className="block text-body-lg font-semibold text-ink">{reviewLabel(path, locale)}{required && <span className="ml-2 text-body-sm font-normal text-body">{t.reviewRequired}</span>}</label>
        {value === "" && <p className="mt-1 text-body-lg text-body">{t.unknownValue}</p>}
        {path === "child.sex" ? <select {...common} value={value} onChange={(e) => onEdit(path, e.target.value)}>
          <option value="">{t.unknownValue}</option><option value="male">{t.sexMale}</option><option value="female">{t.sexFemale}</option><option value="other">{t.sexOther}</option>
        </select> : <input {...common} type="text" autoComplete={path === "reporter.phone" ? "tel" : "off"}
          inputMode={NUMBER_FIELDS.has(path) ? "numeric" : path === "reporter.phone" ? "tel" : "text"}
          lang={textLang(value)} value={NUMBER_FIELDS.has(path) || TIME_FIELDS.has(path) || path === "reporter.phone" ? localizeDigits(value, locale) : value}
          onChange={(e) => onEdit(path, e.target.value)} />}
        {hint && <p id={`${id}-hint`} className="mt-2 break-words text-body-sm text-body">{hint}</p>}
        {invalid && <p id={`${id}-error`} className="mt-2 flex items-start gap-2 text-body-lg text-body"><CircleAlertIcon className="mt-1 size-5" />{fieldError(path, locale)}</p>}
        {edited ? <p className="mt-3 flex items-center gap-2 text-body-sm text-success-text"><CircleCheckIcon />{t.reviewEdited}</p> : value !== "" && <div className="mt-3 border-t border-hairline pt-3">
          <p className="mb-1 text-body-sm font-medium text-body">{t.reviewSource}</p>
          <p data-source="full" lang={textLang(record.draft.source_text)} className="whitespace-pre-wrap break-words text-body-lg text-body">
            {span ? <>{record.draft.source_text.slice(0, span.start_utf16)}<mark className="rounded-xs bg-info-soft text-ink">{record.draft.source_text.slice(span.start_utf16, span.end_utf16)}</mark>{record.draft.source_text.slice(span.end_utf16)}</> : record.draft.source_text}
          </p>
          {!span && <p className="mt-2 text-body-sm text-body">{t.reviewNoSpan}</p>}
          {record.sourceText !== record.draft.source_text && <>
            <p className="mt-3 text-body-sm font-medium text-body">{t.reviewExtraSource}</p>
            <p lang={textLang(record.sourceText)} className="whitespace-pre-wrap break-words text-body-lg text-body">{record.sourceText}</p>
          </>}
        </div>}
      </section>;
    })}
    <label className="flex min-h-11 items-center gap-3 text-body-lg text-body">
      <input type="checkbox" className="size-6 accent-primary" checked={record.approximate} disabled={locked} onBlur={() => onBlur("event.at")} onChange={(e) => onApprox(e.target.checked)} />{t.reviewApprox}
    </label>
  </div>;
}

export function ConfirmBar({ locale, checked, valid, busy, blocked, describedBy, onCheck }: {
  locale: Locale; checked: boolean; valid: boolean; busy: boolean; blocked: boolean; describedBy?: string; onCheck: (checked: boolean) => void;
}) {
  const t = locales[locale];
  return <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface p-4">
    <label className="flex min-h-11 items-center gap-3 text-body-lg text-ink">
      <input type="checkbox" className="size-6 accent-primary" checked={checked} disabled={busy || blocked} onChange={(e) => onCheck(e.target.checked)} />{t.reviewChecked}
    </label>
    <button type="submit" aria-describedby={describedBy} disabled={!checked || !valid || busy || blocked} aria-disabled={!checked || !valid || busy || blocked} className={PRIMARY_BUTTON}>{busy ? t.reviewSubmitting : t.reviewSubmit}</button>
  </div>;
}
