"use client";

// SCREEN-005 manual case form (TASK-025, COMP-032; FR-026, STORY-018, TC-017, BR-023).
// The AI fallback: S-002 hands over here after the follow-up rounds, on E-012/E-013/
// E-023 or a second E-014 (ACT-014), and a parent can open it directly.
//
// - The same fields as S-003 (ReviewFields), one per row in fieldset groups, with Bangla
//   digits and the [MOCK] district number until TASK-009 (OD-022-14).
// - Pre-fill (src/lib/intake/manual.ts): a real API-002 response fills its parsed fields;
//   a [MOCK] hand-off keeps only the parent's own words (never sample answers).
// - Device-local only: each edit is saved on this device; nothing reaches the server
//   here. ACT-005 "পরের ধাপ" checks the required fields (E-001 inline) and opens S-003,
//   where the parent confirms and submits (review-before-submit, BR-004).
// - An attempted submission on this device is never overwritten: S-005 points to S-003.
// - ACT-015 discard clears the device draft and the intake memory.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DraftFieldPath } from "@/contracts";
import { CircleAlertIcon, InfoIcon } from "@/app/components/icons";
import { FocusHeading } from "@/app/components/focus-heading";
import { clearSubmittedDraft, readDraft, saveDraft, type DeviceDraft } from "@/lib/intake/draft-store";
import { clearIntakeMemory, REVIEW_PATH, takeHandoff, type IntakeHandoff } from "@/lib/intake/handoff";
import { manualDraft, manualFromStored, type Prefill } from "@/lib/intake/manual";
import { editField, validateReview } from "@/lib/intake/review";
import { locales, type Locale } from "@/locales";
import { HonestLabel, PRIMARY_BUTTON, TERTIARY_BUTTON, TrashIcon } from "../../parent-ui";
import { ReviewFields, reviewLabel } from "../review/review-fields";

export function ManualForm({ locale }: { locale: Locale }) {
  const t = locales[locale];
  const router = useRouter();
  // takeHandoff once per mounted form (handoff.ts: StrictMode-safe guarded initializer).
  const read = useRef<{ value: IntakeHandoff | null } | null>(null);
  const [handoff] = useState(() => {
    if (read.current === null) read.current = { value: takeHandoff() };
    return read.current.value;
  });
  const [record, setRecord] = useState<DeviceDraft | null>(null);
  const [prefill, setPrefill] = useState<Prefill>("none");
  const [attempted, setAttempted] = useState(false);
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState<DraftFieldPath[]>([]);
  const [tried, setTried] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const storedId = useRef<string | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const restored = useRef(false);

  useEffect(() => {
    // Synchronise the external device store after hydration, never during SSR (as S-003).
    const restore = () => {
      if (restored.current) return;
      restored.current = true;
      const stored = readDraft();
      storedId.current = stored.draft?.client_submission_id ?? null;
      if (stored.draft?.attempted) {
        setAttempted(true);
      } else {
        const start = handoff ? manualDraft(handoff) : stored.draft ? manualFromStored(stored.draft) : manualDraft(null);
        setPrefill(start.prefill);
        persist(start.record);
      }
      setReady(true);
    };
    restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once after hydration
  }, []);

  function persist(next: DeviceDraft) {
    const saved = saveDraft(next, undefined, storedId.current ?? next.client_submission_id, { transition: "discard-replace" });
    if (saved) storedId.current = next.client_submission_id;
    setStorageFailed(!saved);
    setRecord(next);
  }
  function change(path: DraftFieldPath, value: string) {
    if (!record) return;
    const next = editField(record, path, value);
    persist(next);
    if (tried) setErrors(validateReview(next));
  }
  function changeBatch(edits: Partial<Record<DraftFieldPath, string>>, approximate?: boolean) {
    if (!record) return;
    const next = { ...record, edits: { ...record.edits, ...edits }, ...(approximate === undefined ? {} : { approximate }) };
    persist(next);
    if (tried) setErrors(validateReview(next));
  }
  function next(event: FormEvent) {
    event.preventDefault();
    if (!record) return;
    const missing = validateReview(record);
    setTried(true);
    setErrors(missing);
    if (missing.length > 0) {
      summary.current?.focus();
      return;
    }
    if (storageFailed) return; // S-003 reads the device draft; it must be saved first
    router.push(REVIEW_PATH);
  }
  function discard() {
    if (!window.confirm(t.discardConfirm)) return;
    if (record) clearSubmittedDraft(record.client_submission_id);
    clearIntakeMemory();
    router.push("/");
  }

  return (
    <div data-surface="parent" lang={locale} className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-4 pt-6 pb-12">
      <FocusHeading className="text-heading-2 font-semibold text-ink">{t.manualFormTitle}</FocusHeading>
      <div className="flex flex-wrap gap-2">
        <HonestLabel>{t.syntheticBadge}</HonestLabel>
        {record?.cached && <HonestLabel>{t.cachedBadge}</HonestLabel>}
      </div>
      <p className="flex items-start gap-2 text-body-lg text-body">
        <InfoIcon className="mt-1 size-5 shrink-0 text-info" />
        <span>{t.manualSyntheticNote}</span>
      </p>

      {!ready ? null : attempted ? (
        <section role="alert" className="flex flex-col gap-3 rounded-lg border border-control bg-card p-4 text-body-lg text-body">
          <p className="flex items-start gap-2"><InfoIcon className="mt-1 size-5 shrink-0 text-info" />{t.manualAttemptedPending}</p>
          <Link href={REVIEW_PATH} className={`${PRIMARY_BUTTON} self-start`}>{t.manualOpenReview}</Link>
        </section>
      ) : record && (
        <>
          <p className="text-body-lg text-body">{t.manualIntro}</p>
          {prefill === "ai" && <p className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 shrink-0 text-info" />{t.manualPrefilledAi}</p>}
          {handoff?.mock && <p className="flex flex-wrap items-center gap-2 text-body-lg text-body"><HonestLabel lang="en">{t.mockLabel}</HonestLabel>{t.manualMockNotUsed}</p>}
          {record.sourceText && (
            <section aria-labelledby="manual-own-words" className="flex flex-col gap-2 rounded-lg border border-hairline bg-card p-4">
              <h2 id="manual-own-words" className="text-body-lg font-semibold text-ink">{t.manualYourWords}</h2>
              <p lang="bn" className="text-body-lg whitespace-pre-wrap text-body [overflow-wrap:anywhere]">{record.sourceText}</p>
            </section>
          )}
          {storageFailed && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 shrink-0 text-info" />{t.reviewStorageFailed}</p>}
          <div id="manual-required" ref={summary} tabIndex={-1} role="alert" aria-atomic="true" className={errors.length > 0 ? "rounded-lg border border-control bg-card p-4 text-body-lg text-body" : "sr-only"}>
            {errors.length > 0 && <>
              <p className="flex items-start gap-2"><CircleAlertIcon className="mt-1 size-5 shrink-0 text-info" />{t.reviewErrorSummary}</p>
              <ul className="mt-3 list-inside list-disc">
                {errors.map((path) => {
                  const target = path.startsWith("child.age_") ? "review-age-exact" : `review-${path}`;
                  return <li key={path}><a href={`#${target}`} className="inline-flex min-h-11 items-center" onClick={(e) => { e.preventDefault(); document.getElementById(target)?.focus(); }}>{reviewLabel(path, locale)}</a></li>;
                })}
              </ul>
            </>}
          </div>
          <form noValidate onSubmit={next} className="flex flex-col gap-6" aria-describedby={errors.length > 0 ? "manual-required" : undefined}>
            <ReviewFields key={record.client_submission_id} record={record} locale={locale} errors={errors} onEdit={change} onBatch={changeBatch}
              onBlur={() => { if (tried) setErrors(validateReview(record)); }} locked={false}
              onApprox={(value) => persist({ ...record, approximate: value })} />
            <div className="flex flex-col gap-2">
              <button type="submit" className={`${PRIMARY_BUTTON} self-start`}>{t.manualNext}</button>
              <p className="text-body-md text-mute">{t.manualNextHint}</p>
            </div>
          </form>
          <button type="button" className={`${TERTIARY_BUTTON} self-start`} onClick={discard}><TrashIcon />{t.discardAction}</button>
        </>
      )}
    </div>
  );
}
