"use client";

// SCREEN-005 manual case form (TASK-025; D3 SCREEN-005, FR-026, TC-017). P3-013 thin
// path: reuses S-003 validation, fields and submit flow (BR-004, BR-015, BR-016,
// BR-023, API-003). Manual input is treated as the parent's own words; nothing is
// guessed from AI sources. The form works with no previous draft: empty fields
// stay unknown. An existing device-local draft carries over without any URL
// payload, and a server submission only fires after the review checkbox.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { caseDraftSchema, errorEnvelope, type DraftFieldPath, type ErrorEnvelope } from "@/contracts";
import { CircleAlertIcon, InfoIcon, LoaderCircleIcon } from "@/app/components/icons";
import { FocusHeading } from "@/app/components/focus-heading";
import { clearSubmittedDraft, clearSubmittedReference, createDeviceDraft, readDraft, readSubmittedReference, saveDraft, type DeviceDraft } from "@/lib/intake/draft-store";
import { clearIntakeMemory, INTAKE_PATH, takeHandoff, type IntakeHandoff } from "@/lib/intake/handoff";
import { buildSubmission, createSubmitter, editField, newSubmission, validateReview } from "@/lib/intake/review";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale } from "@/locales";
import { CircleCheckIcon, HonestLabel, PRIMARY_BUTTON, TERTIARY_BUTTON, TrashIcon } from "../../parent-ui";
import { ConfirmBar, ReviewFields, reviewLabel } from "../review/review-fields";

// A blank structural draft the form mounts on when there is no handoff and no
// stored record. Everything is unknown; the parent fills what they know. The
// contract requires `evidence: {}` and `event.at_approx: false` to parse.
function emptyManualDraft(): DeviceDraft {
  const now = Date.now();
  const draft = caseDraftSchema.parse({
    kind: "missing",
    source_text: "",
    child: {
      name: null, name_latin: null, sex: "unknown",
      age_years: null, age_min: null, age_max: null,
      height_cm: null, clothing: null, marks: null,
    },
    event: {
      at: null, at_lower: null, at_upper: null, at_approx: false,
      place_text: null, district_text: null, district_code: null,
      thana: null, circumstances: null,
    },
    reporter: { relation: null, phone: null },
    evidence: {},
  });
  return {
    version: 1,
    draft,
    sourceText: "",
    // A fresh client submission ID keeps API-003 idempotent on retry. Without it
    // the submitter would re-validate against the previous UUID on every keystroke.
    client_submission_id: crypto.randomUUID(),
    savedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
    draftToken: undefined,
    edits: {},
    approximate: false,
    attempted: false,
    mock: false,
    cached: false,
  };
}

export function ManualFormScreen({ locale }: { locale: Locale }) {
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
  const focusNewId = useRef(false);
  const [record, setRecord] = useState<DeviceDraft | null>(null);
  const [pendingHandoff, setPendingHandoff] = useState<IntakeHandoff | null>(null);
  const [ready, setReady] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [storageUnreadable, setStorageUnreadable] = useState(false);
  const [corruptAttemptedNotice, setCorruptAttemptedNotice] = useState<string | null>(null);
  const [clearFailed, setClearFailed] = useState(false);
  const [error, setError] = useState<ErrorEnvelope | null>(null);
  const [fields, setFields] = useState<DraftFieldPath[]>([]);
  const [success, setSuccess] = useState<{ id: string; ref: string; mock?: boolean; cached?: boolean } | null>(null);

  useEffect(() => {
    active.current = true;
    const restore = () => {
      if (!restored.current) {
        restored.current = true;
        const stored = readDraft();
        const submitted = readSubmittedReference();
        // Successful submissions stay visible (the parent may return to copy the
        // reference). Without a stored or handed-off draft we still need a usable
        // screen, so build an empty record the parent can fill in by hand.
        if (submitted && !handoff && !stored.draft && !stored.corruptAttemptedId) {
          setSuccess(submitted);
          setReady(true);
          return;
        }
        if (stored.corruptAttemptedId) {
          setCorruptAttemptedNotice(stored.corruptAttemptedId);
          setReady(true);
          return;
        }
        if (stored.expiredId && !handoff) {
          setExpired(true);
          setClearFailed(!stored.available);
          setReady(true);
          setStorageUnreadable(!stored.available);
          return;
        }
        if (handoff) clearSubmittedReference();
        if (stored.draft?.attempted && handoff?.response) {
          setPendingHandoff(handoff);
          setRecord(stored.draft);
          everSaved.current = true;
          setReady(true);
          setFields(validateReview(stored.draft));
          setStorageUnreadable(!stored.available);
          return;
        }
        // No previous draft and no handoff: an empty manual draft. The
        // submitter writes it to storage on first save so the device-local
        // copy is never silently lost on refresh.
        const next = stored.draft?.attempted ? stored.draft : handoff ? createDeviceDraft(handoff) : stored.draft ?? emptyManualDraft();
        everSaved.current = stored.draft !== null;
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
    };
    restore();
    return () => { active.current = false; };
  }, [handoff]);
  useEffect(() => {
    if (error || expired) summary.current?.focus();
  }, [error, expired]);
  useEffect(() => {
    if (!record) return;
    const onExpire = () => {
      setClearFailed(!clearSubmittedDraft(record.client_submission_id));
      setRecord(null);
      setPendingHandoff(null);
      setExpired(true);
    };
    const check = () => {
      if (Date.now() >= record.expiresAt) onExpire();
    };
    check();
    if (record.expiresAt <= Date.now()) return;
    const MAX_TIMEOUT_MS = 2_147_483_647;
    const delay = Math.min(MAX_TIMEOUT_MS, Math.max(0, record.expiresAt - Date.now()));
    const timer = setTimeout(onExpire, delay);
    const onVisibility = () => { if (document.visibilityState === "visible") check(); };
    if (typeof document.addEventListener === "function") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      clearTimeout(timer);
      if (typeof document.removeEventListener === "function") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [record]);

  const id = error?.error.id;
  const e019FromApi = id === "E-019";
  const sessionExpired = e019FromApi || id === "E-002";
  const conflict = id === "E-006";
  const locked = busy || Boolean(record?.attempted) || sessionExpired || expired;
  const valid = record !== null && buildSubmission(record, true) !== null;
  useEffect(() => {
    if (focusNewId.current && !locked) {
      focusNewId.current = false;
      (document.getElementById("review-child.name") ?? summary.current)?.focus();
    }
  }, [record?.client_submission_id, locked]);
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
  function changeBatch(edits: Partial<Record<DraftFieldPath, string>>, approximate?: boolean) {
    if (!record || locked) return;
    persist({ ...record, edits: { ...record.edits, ...edits }, ...(approximate === undefined ? {} : { approximate }) });
    setChecked(false); setError(null); setFields([]);
  }
  function blur(path: DraftFieldPath) {
    if (!record || locked) return;
    setFields(validateReview(record));
    void path;
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!record || record.mock || submitting.current || success || conflict || sessionExpired || expired || pendingHandoff) return;
    if (record.expiresAt <= Date.now()) { setClearFailed(!clearSubmittedDraft(record.client_submission_id)); setRecord(null); setPendingHandoff(null); setExpired(true); summary.current?.focus(); return; }
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
      setSuccess({ id: result.data.id, ref: result.data.ref_code, mock: record.mock, cached: record.cached });
    } else if (active.current) {
      setBusy(false);
      if (result) {
        setError(result.error); setFields(result.error.error.fields ?? []);
        if (result.dispatched === false) { setRecord(record); setStorageFailed(true); setChecked(false); }
        else if (result.error.error.id === "E-001") { setRecord({ ...record, attempted: false }); setChecked(false); }
        else if (result.error.error.id === "E-019") { setClearFailed(result.cleared === false); setRecord(null); setChecked(false); setExpired(true); }
      }
    }
  }
  function discard() {
    if (submitting.current) return;
    const isAttempted = Boolean(record?.attempted || corruptAttemptedNotice);
    const prompt = isAttempted ? t.reviewDiscardWarn : t.discardConfirm;
    if (!window.confirm(prompt)) return;
    const cleared = record ? clearSubmittedDraft(record.client_submission_id) : corruptAttemptedNotice ? clearSubmittedDraft(corruptAttemptedNotice) : true;
    clearSubmittedReference();
    clearIntakeMemory();
    setRecord(null); setChecked(false); setError(null);
    if (!cleared) { setClearFailed(true); return; }
    router.push(INTAKE_PATH);
  }

  return <div data-surface="parent" lang={locale} className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-4 pt-6 pb-12">
    <FocusHeading className="text-heading-2 font-semibold text-ink">{t.manualFormTitle}</FocusHeading>
    <div className="flex flex-wrap gap-2"><HonestLabel>{t.syntheticBadge}</HonestLabel>{(success?.mock ?? record?.mock) && <HonestLabel lang="en">{t.mockLabel}</HonestLabel>}{(success?.cached ?? record?.cached) && <HonestLabel>{t.cachedBadge}</HonestLabel>}</div>
    <p role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-2 text-body-lg text-body">
      {busy ? <><LoaderCircleIcon className="mt-1 size-5" />{t.reviewSubmitting}</> : success ? <><CircleCheckIcon className="mt-1 size-5 text-success-text" />{t.reviewSubmitted.replace("{ref}", localizeDigits(success.ref, locale))}</> : !ready ? <><InfoIcon className="mt-1 size-5" />{t.stillWorking}</> : null}
    </p>
    {storageUnreadable && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewStorageUnreadable}</p>}
    {corruptAttemptedNotice && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewCorruptAttempted}</p>}
    {clearFailed && <p role="alert" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewClearFailed}</p>}
    {success ? (
      <div className="flex flex-col gap-4">
        <Link className={`${PRIMARY_BUTTON} self-start`} href={`/report/${encodeURIComponent(success.id)}`}>
          {t.reviewOpenReport}
        </Link>
        <Link className={TERTIARY_BUTTON} href={INTAKE_PATH} onClick={() => { clearSubmittedReference(); }}>
          {t.reviewBack}
        </Link>
      </div>
    ) : expired ? (
      <div ref={summary} tabIndex={-1} role="alert" aria-atomic="true" className="flex flex-col gap-3 rounded-lg border border-control bg-card p-4 text-body-lg text-body">
        <p className="flex items-start gap-2"><CircleAlertIcon className="mt-1 size-5 text-info" />{t.reviewExpired}</p>
        <Link href={INTAKE_PATH} className={TERTIARY_BUTTON}>{t.reviewBack}</Link>
      </div>
    ) : ready && !record ? <>
      <p className="text-body-lg text-body">{t.reviewEmpty}</p>
      {corruptAttemptedNotice && <button type="button" className={TERTIARY_BUTTON} onClick={discard}><TrashIcon />{t.reviewDiscardDevice}</button>}
      <Link className={TERTIARY_BUTTON} href={INTAKE_PATH}>{t.reviewBack}</Link>
    </> : record && <>
      {pendingHandoff && (
        <section role="alert" className="flex flex-col gap-3 rounded-lg border border-control bg-card p-4 text-body-lg text-body">
          <p className="flex items-start gap-2 font-medium text-ink">
            <InfoIcon className="mt-1 size-5 text-info" />
            <span>{t.earlierDraftFound}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} className={TERTIARY_BUTTON} onClick={() => { if (submitting.current) return; setPendingHandoff(null); }}>
              {t.earlierDraftContinue}
            </button>
            <button type="button" disabled={busy} className={TERTIARY_BUTTON} onClick={() => {
              if (submitting.current) return;
              const fresh = createDeviceDraft(pendingHandoff);
              if (fresh && window.confirm(t.discardConfirm)) {
                const saved = saveDraft(fresh, undefined, record.client_submission_id, { transition: "discard-replace", requireExisting: true });
                if (!saved) { setStorageFailed(true); return; }
                focusNewId.current = true;
                setPendingHandoff(null);
                setRecord(fresh); setStorageFailed(false); setExpired(false);
                setChecked(false); setError(null);
                setFields(validateReview(fresh));
              }
            }}>
              {t.earlierDraftReplace}
            </button>
          </div>
        </section>
      )}
      <p className="text-body-lg text-body">{t.manualFormIntro}</p>
      <p className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5" />{t.reviewLocal}</p>
      {storageFailed && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewStorageFailed}</p>}
      <div id="review-required" ref={summary} tabIndex={-1} role="alert" aria-atomic="true" className={error || expired || fields.length > 0 ? "rounded-lg border border-control bg-card p-4 text-body-lg text-body" : "sr-only"}>
        {(error || expired || fields.length > 0) && <>
          <p className="flex items-start gap-2"><CircleAlertIcon className="mt-1 size-5 text-info" />{expired ? t.reviewExpired : id === "E-001" ? t.reviewErrorSummary : conflict ? t.reviewConflict : e019FromApi ? t.reviewSessionExpired : id === "E-002" ? t.reviewSession : error ? (locale === "bn" ? error.error.message_bn : error.error.message_en) : t.reviewRequiredSummary}</p>
          {fields.length > 0 && <ul className="mt-3 list-inside list-disc">{fields.map((path) => <li key={path}><a href={`#${path.startsWith("child.age_") ? "review-age-exact" : `review-${path}`}`} className="inline-flex min-h-11 items-center" onClick={(e) => { e.preventDefault(); document.getElementById(path.startsWith("child.age_") ? "review-age-exact" : `review-${path}`)?.focus(); }}>{reviewLabel(path, locale)}</a></li>)}</ul>}
          {conflict && <button type="button" className={`${TERTIARY_BUTTON} mt-3`} onClick={() => {
            const fresh = newSubmission(record);
            const saved = saveDraft(fresh, undefined, record.client_submission_id, { transition: "payload-conflict", requireExisting: everSaved.current });
            if (!saved && everSaved.current) { setStorageFailed(true); return; }
            everSaved.current ||= saved;
            setRecord(fresh); setStorageFailed(!saved);
            setError(null);
            setChecked(false);
            setFields([]);
            focusNewId.current = true;
          }}>{t.reviewNewId}</button>}
          {(sessionExpired || expired) && <Link href={INTAKE_PATH} className={`${TERTIARY_BUTTON} mt-3`}>{t.reviewBack}</Link>}
        </>}
      </div>
      {record.attempted && !conflict && !sessionExpired && <p tabIndex={-1} className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewRetryFrozen}</p>}
      <form noValidate onSubmit={submit} className="flex flex-col gap-6" aria-busy={busy}>
        <ReviewFields key={record.client_submission_id} record={record} locale={locale} errors={fields} onEdit={change} onBatch={changeBatch} onBlur={blur} locked={locked}
          onApprox={(value) => { if (!locked) { persist({ ...record, approximate: value }); setChecked(false); setError(null); } }} />
        <ConfirmBar locale={locale} checked={checked} valid={valid} busy={busy} blocked={conflict || sessionExpired || expired || Boolean(pendingHandoff)} mock={record.mock} describedBy={!valid ? "review-required" : undefined} onCheck={setChecked} />
      </form>
      <Link className={TERTIARY_BUTTON} href={INTAKE_PATH} aria-disabled={busy || undefined} onClick={(e) => { if (busy) e.preventDefault(); }}>{t.reviewBack}</Link>
      <button type="button" disabled={busy} className={TERTIARY_BUTTON} onClick={discard}><TrashIcon />{t.reviewDiscardDevice}</button>
    </>}
  </div>;
}
