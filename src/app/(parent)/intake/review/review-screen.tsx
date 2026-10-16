"use client";

// TASK-022 / SCREEN-003 / BR-004: restore only on the device; submit is an event.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorEnvelope, type DraftFieldPath, type ErrorEnvelope } from "@/contracts";
import { CircleAlertIcon, InfoIcon, LoaderCircleIcon } from "@/app/components/icons";
import { FocusHeading } from "@/app/components/focus-heading";
import { clearSubmittedDraft, createDeviceDraft, readDraft, saveDraft, type DeviceDraft } from "@/lib/intake/draft-store";
import { clearIntakeMemory, INTAKE_PATH, isPlainClick, MANUAL_FORM_PATH, takeHandoff, type IntakeHandoff } from "@/lib/intake/handoff";
import { buildSubmission, createSubmitter, editField, newSubmission, validateReview } from "@/lib/intake/review";
import { localizeDigits } from "@/lib/numerals";
import { textLang } from "@/lib/intake/draft-summary";
import { locales, type Locale } from "@/locales";
import { CircleCheckIcon, HonestLabel, TERTIARY_BUTTON, TrashIcon } from "../../parent-ui";
import { ConfirmBar, ReviewFields, reviewLabel } from "./review-fields";

export function ReviewScreen({ locale }: { locale: Locale }) {
  const t = locales[locale];
  const router = useRouter();
  // Guard even null: StrictMode/effect replay must not take a later handoff.
  const read = useRef<{ value: IntakeHandoff | null } | null>(null);
  // eslint-disable-next-line react-hooks/refs -- mandated takeHandoff once-per-consumer guard (OD-021-4)
  const [handoff] = useState(() => {
    if (read.current === null) read.current = { value: takeHandoff() };
    return read.current.value;
  });
  const restored = useRef(false);
  const everSaved = useRef(false);
  const active = useRef(true);
  const submitting = useRef(false);
  const submitter = useRef<ReturnType<typeof createSubmitter> | null>(null);
  const summary = useRef<HTMLDivElement>(null);
  const [record, setRecord] = useState<DeviceDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [storageUnreadable, setStorageUnreadable] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);
  const [error, setError] = useState<ErrorEnvelope | null>(null);
  const [fields, setFields] = useState<DraftFieldPath[]>([]);
  const [success, setSuccess] = useState<{ id: string; ref: string } | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- synchronize the external device store once after hydration */
  useEffect(() => {
    active.current = true;
    if (!restored.current) {
      restored.current = true;
      const stored = readDraft();
      const next = stored.draft?.attempted ? stored.draft : handoff ? createDeviceDraft(handoff) : stored.draft;
      everSaved.current = stored.draft !== null;
      // Synchronize an external device store after hydration, never during SSR.
      setRecord(next);
      setReady(true);
      setFields(next ? validateReview(next) : []);
      setStorageUnreadable(!stored.available);
      if (next) {
        const saved = saveDraft(next, undefined, stored.draft?.client_submission_id ?? null, { requireExisting: stored.draft !== null });
        everSaved.current ||= saved;
        setStorageFailed(!saved);
      }
    }
    return () => { active.current = false; };
  }, [handoff]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (error || expired) summary.current?.focus();
  }, [error, expired]);
  useEffect(() => {
    if (!record) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, record.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [record?.expiresAt, record]);

  const id = error?.error.id;
  const sessionExpired = id === "E-019" || id === "E-002";
  const conflict = id === "E-006";
  const locked = busy || Boolean(record?.attempted) || sessionExpired || expired;
  const valid = record !== null && buildSubmission(record, true) !== null;
  function persist(next: DeviceDraft, transition?: "payload-conflict") {
    const saved = saveDraft(next, undefined, record?.client_submission_id ?? next.client_submission_id, { transition, requireExisting: everSaved.current });
    everSaved.current ||= saved;
    setRecord(next); setStorageFailed(!saved);
  }
  function change(path: DraftFieldPath, value: string) {
    if (!record || locked) return;
    persist(editField(record, path, value)); setChecked(false); setError(null);
    setFields((old) => old.filter((field) => field !== path));
  }
  function blur(path: DraftFieldPath) {
    if (!record || locked) return;
    setFields(validateReview(record));
    void path;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!record || submitting.current || success || conflict || sessionExpired || expired) return;
    if (record.expiresAt <= Date.now()) { setExpired(true); summary.current?.focus(); return; }
    const invalid = validateReview(record);
    if (!checked || !buildSubmission(record, checked)) {
      setFields(invalid); setError(errorEnvelope("E-001", { fields: invalid })); return;
    }
    submitting.current = true; setBusy(true); setError(null); setFields([]);
    const attempted = { ...record, attempted: true };
    setRecord(attempted);
    submitter.current ??= createSubmitter();
    const result = await submitter.current(record, true, everSaved.current);
    submitting.current = false;
    if (result?.ok) {
      if (!active.current) return;
      clearIntakeMemory();
      setBusy(false); setRecord(null); setChecked(false);
      setClearFailed(!result.cleared);
      setSuccess({ id: result.data.id, ref: result.data.ref_code });
      // S-004 belongs to Mahim's TASK-024 / PR #26; target is planned on this base.
      if (result.cleared) router.push(`/report/${result.data.id}`);
    } else if (active.current) {
      setBusy(false);
      if (result) {
        setError(result.error); setFields(result.error.error.fields ?? []);
        if (result.dispatched === false) { setRecord(record); setStorageFailed(true); setChecked(false); }
        else if (result.error.error.id === "E-001") { setRecord({ ...record, attempted: false }); setChecked(false); }
      }
    }
  }
  function discard() {
    if (submitting.current || !window.confirm(t.discardConfirm)) return;
    const cleared = record ? clearSubmittedDraft(record.client_submission_id) : true; clearIntakeMemory(); setRecord(null); setChecked(false); setError(null);
    if (!cleared) { setClearFailed(true); return; }
    router.push(INTAKE_PATH);
  }

  return <div data-surface="parent" lang={locale} className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-4 pt-6 pb-12">
    <FocusHeading className="text-heading-2 font-semibold text-ink">{t.reviewTitle}</FocusHeading>
    <div className="flex flex-wrap gap-2"><HonestLabel>{t.syntheticBadge}</HonestLabel>{record?.mock && <HonestLabel lang="en">{t.mockLabel}</HonestLabel>}{record?.cached && <HonestLabel>{t.cachedBadge}</HonestLabel>}</div>
    <p role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-2 text-body-lg text-body">
      {busy ? <><LoaderCircleIcon className="mt-1 size-5" />{t.reviewSubmitting}</> : success ? <><CircleCheckIcon className="mt-1 size-5 text-success-text" />{t.reviewSubmitted.replace("{ref}", localizeDigits(success.ref, locale))}</> : !ready ? <><InfoIcon className="mt-1 size-5" />{t.stillWorking}</> : null}
    </p>
    {storageUnreadable && <p role="status" className="text-body-lg text-body">{t.reviewStorageUnreadable}</p>}
    {clearFailed && <p role="alert" className="text-body-lg text-body">{t.reviewClearFailed}</p>}
    {success ? <Link className={TERTIARY_BUTTON} href={`/report/${success.id}`}>{t.reviewPlannedReport}</Link> : ready && !record ? <>
      <p className="text-body-lg text-body">{t.reviewEmpty}</p><Link className={TERTIARY_BUTTON} href={INTAKE_PATH}>{t.reviewBack}</Link>
    </> : record && <>
      <p className="text-body-lg text-body">{t.reviewIntro}</p>
      <p className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5" />{t.reviewLocal}</p>
      {storageFailed && <p role="status" className="text-body-lg text-body">{t.reviewStorageFailed}</p>}
      {record.sourceText !== record.draft.source_text && <section className="border-y border-hairline py-4">
        <h2 className="text-body-lg font-semibold text-ink">{t.reviewExtraSource}</h2><p lang={textLang(record.sourceText)} className="whitespace-pre-wrap break-words text-body-lg text-body">{record.sourceText}</p>
      </section>}
      <div id="review-required" ref={summary} tabIndex={-1} role="alert" aria-atomic="true" className={error || expired || fields.length > 0 ? "rounded-lg border border-control bg-card p-4 text-body-lg text-body" : "sr-only"}>
        {(error || expired || fields.length > 0) && <>
          <p className="flex items-start gap-2"><CircleAlertIcon className="mt-1 size-5" />{expired ? t.reviewExpired : id === "E-001" ? t.reviewErrorSummary : conflict ? t.reviewConflict : sessionExpired ? t.reviewSession : error ? (locale === "bn" ? error.error.message_bn : error.error.message_en) : t.reviewRequiredSummary}</p>
          {fields.length > 0 && <ul className="mt-3 list-inside list-disc">{fields.map((path) => <li key={path}><a href={`#review-${path}`} className="inline-flex min-h-11 items-center" onClick={(e) => { e.preventDefault(); document.getElementById(`review-${path}`)?.focus(); }}>{reviewLabel(path, locale)}</a></li>)}</ul>}
          {conflict && <button type="button" className={`${TERTIARY_BUTTON} mt-3`} onClick={() => { persist(newSubmission(record), "payload-conflict"); setError(null); setChecked(false); setFields([]); }}>{t.reviewNewId}</button>}
          {(sessionExpired || expired) && <Link href={INTAKE_PATH} className={`${TERTIARY_BUTTON} mt-3`}>{t.reviewBack}</Link>}
        </>}
      </div>
      {record.attempted && !conflict && !sessionExpired && <p className="text-body-lg text-body">{t.reviewRetryFrozen}</p>}
      <form noValidate onSubmit={submit} className="flex flex-col gap-6" aria-busy={busy}>
        <ReviewFields record={record} locale={locale} errors={fields} onEdit={change} onBlur={blur} locked={locked}
          onApprox={(value) => { if (!locked) { persist({ ...record, approximate: value }); setChecked(false); setError(null); } }} />
        <ConfirmBar locale={locale} checked={checked} valid={valid} busy={busy} blocked={conflict || sessionExpired || expired} describedBy={!valid ? "review-required" : undefined} onCheck={setChecked} />
      </form>
      <Link className={TERTIARY_BUTTON} href={INTAKE_PATH} aria-disabled={busy || undefined} onClick={(e) => { if (busy) e.preventDefault(); }}>{t.reviewBack}</Link>
      <Link className="inline-flex min-h-11 items-center text-body-lg" href={MANUAL_FORM_PATH} aria-disabled={locked || undefined} onClick={(e) => {
        if (!isPlainClick(e) || locked) { if (locked) e.preventDefault(); return; }
        setStorageFailed(!saveDraft(record));
      }}>{t.reviewPlannedManual}</Link>
      <button type="button" disabled={busy} className={TERTIARY_BUTTON} onClick={discard}><TrashIcon />{t.reviewDiscardDevice}</button>
    </>}
  </div>;
}
