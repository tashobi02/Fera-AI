"use client";

// TASK-022 / SCREEN-003 / BR-004: restore only on the device; submit is an event.
// P3-035/ACT017: when the device-local edit pointer is present (set by the
// "Correct details" lane on S-006), render the EditModeScreen instead of the
// create flow. The dispatch is read-once and StrictMode-safe; the edit flow
// owns its own state, draft store, and submitter.
//
// The pointer read here is a PURE snapshot (no storage writes during render);
// the mutation (sweeping stale/corrupt records) is done in a separate effect
// below, so React 18 StrictMode / concurrent re-renders cannot accidentally
// drop the pointer between the two hook lifecycles.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { errorEnvelope, type DraftFieldPath, type ErrorEnvelope } from "@/contracts";
import { CircleAlertIcon, InfoIcon, LoaderCircleIcon } from "@/app/components/icons";
import { FocusHeading } from "@/app/components/focus-heading";
import { clearSubmittedDraft, clearSubmittedReference, createDeviceDraft, readDraft, readSubmittedReference, saveDraft, type DeviceDraft } from "@/lib/intake/draft-store";
import { readEditMode } from "@/lib/intake/edit-handoff";
import { clearIntakeMemory, INTAKE_PATH, MANUAL_FORM_PATH, takeHandoff, type IntakeHandoff } from "@/lib/intake/handoff";
import { buildSubmission, createSubmitter, editField, newSubmission, validateReview } from "@/lib/intake/review";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale } from "@/locales";
import { CircleCheckIcon, HonestLabel, PRIMARY_BUTTON, TERTIARY_BUTTON, TrashIcon } from "../../parent-ui";
import { ConfirmBar, ReviewFields, reviewFieldInputId, reviewLabel } from "./review-fields";
import { EditModeScreen } from "./edit-mode-screen";

// TASK-022 / SCREEN-003 / BR-004: restore only on the device; submit is an event.
// P3-035/ACT017: when the device-local edit pointer is present (set by the
// "Correct details" lane on S-006), the edit flow owns the screen. The dispatch
// is read-once and StrictMode-safe; the create flow is the default.
//
// The create flow is inlined into this function (rather than a sub-component)
// so the existing hook-harness tests' slot recorder sees every `useRef`,
// `useState` and `useEffect`. Splitting them into sibling components hides the
// create-flow state from the test harness and breaks lifecycle regression
// coverage (NODE-hook tests in tests/intake/review/review-lifecycle.test.ts).
const subscribeToEntry = () => () => {};
// Pure peek — the snapshot getter must never mutate storage, otherwise a
// React 18 StrictMode / concurrent re-render can drop the pointer between the
// two hook lifecycles. The mutation-cleanup effect below performs the
// sweep (sweeping stale / corrupt records) after mount.
const readEditEntry = () => readEditMode(undefined, Date.now(), 24 * 60 * 60 * 1000, { mutate: false }) !== null;
const serverEntry = () => null;

// Resolve device storage after hydration before mounting either flow. Their
// independent hook lifecycles never depend on a conditional early return.
export function ReviewEntryScreen({ locale }: { locale: Locale }) {
  const editing = useSyncExternalStore<boolean | null>(subscribeToEntry, readEditEntry, serverEntry);
  // Mutation cleanup: this effect runs once after mount with the default
  // (mutating) read so a stale / corrupt / v1 pointer is still swept on
  // entry. It is intentionally a fire-and-forget; the snapshot above is the
  // source of truth for the rendered flow.
  useEffect(() => {
    readEditMode();
  }, []);
  if (editing === null) return <div data-surface="parent" className="mx-auto max-w-[36rem] px-4 py-8"><h1 className="text-heading-2">{locales[locale].reviewTitle}</h1><p role="status">{locales[locale].stillWorking}</p></div>;
  return editing ? <EditModeScreen locale={locale} /> : <ReviewScreen locale={locale} />;
}

export function ReviewScreen({ locale }: { locale: Locale }) {
  const t = locales[locale];
  const router = useRouter();
  // ACT017: the "Correct details" click on S-006 records a device-local
  // pointer; the same page here is the only consumer. Read once on first
  // render so a late write to the pointer does not re-enter edit mode.
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
  const focusContinued = useRef(false);
  // Discard dialog: the trigger element is held in a ref so the dialog can
  // restore focus to the discard button (or the replace button) when the
  // parent cancels — the same source-field behaviour the previous
  // window.confirm() provided implicitly. The two dialog refs match the
  // two dialogs (device discard, and "earlier draft — start with new
  // details" replace).
  const discardTrigger = useRef<HTMLElement | null>(null);
  const discardDialog = useRef<HTMLDialogElement | null>(null);
  const replaceDialog = useRef<HTMLDialogElement | null>(null);
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
  // Dialog open state is split so the two discard entry points (the bottom
  // "delete draft" button and the "start with new details" replace button
  // on the pending-handoff card) each get the correct title/body and cancel
  // target. "discard" is the device discard, "replace" is the "earlier draft
  // found — start with new details" confirmation.
  const [discardOpen, setDiscardOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);

  useEffect(() => {
    active.current = true;
    const restore = () => {
      if (!restored.current) {
        restored.current = true;
        const stored = readDraft();
        const submitted = readSubmittedReference();
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
        // OD-022-10 (fix round 2, lead-authorised 2026-10-16): the stored record was
        // swept on read because it was past expiresAt. Show the expired notice
        // instead of the empty state so a parent who returns on the same device
        // sees why their draft disappeared.
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
      // OD-022-10 (fix round 2, lead-authorised 2026-10-16): drop the record from
      // React state and from storage. The screen renders only the expired notice
      // and the back link, so no fields remain visible.
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
    const MAX_TIMEOUT_MS = 2_147_483_647; // 2**31 - 1
    const delay = Math.min(MAX_TIMEOUT_MS, Math.max(0, record.expiresAt - Date.now()));
    const timer = setTimeout(onExpire, delay);
    // visibilitychange: a tab returning from hidden should run the expiry check
    // at once so a clock advance during a hidden tab does not leave the page on
    // an expired draft. The Node test harness does not provide addEventListener,
    // so guard the call.
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
  // record re-creates when its fields change; the timer would also re-run, which is
  // safe: a freshly edited record still has the same expiresAt and the same UUID.
  }, [record]);

  const id = error?.error.id;
  // OD-022-10 (fix round 2, lead-authorised 2026-10-16): E-019 from /api/cases clears
  // the device record (handled in review.ts submit) and uses the catalogue copy,
  // different from E-002 (staff JWT). Update #3 sets a separate display flag so
  // E-002 keeps the older "session expired" copy until refresh, while E-019
  // explicitly drops the device state.
  const e019FromApi = id === "E-019";
  const sessionExpired = e019FromApi || id === "E-002";
  const conflict = id === "E-006";
  const locked = busy || Boolean(record?.attempted) || sessionExpired || expired;
  const valid = record !== null && buildSubmission(record, true) !== null;
  // Wire the platform <dialog> elements to their open state. The browser
  // owns the focus trap, Escape handling and inert background.
  useEffect(() => {
    const node = discardDialog.current;
    if (!node) return;
    if (discardOpen) { if (!node.open) node.showModal(); }
    else if (node.open) node.close();
  }, [discardOpen]);
  useEffect(() => {
    const node = replaceDialog.current;
    if (!node) return;
    if (replaceOpen) { if (!node.open) node.showModal(); }
    else if (node.open) node.close();
  }, [replaceOpen]);
  useEffect(() => {
    if (focusNewId.current && !locked) {
      focusNewId.current = false;
      (document.getElementById("review-child.name") ?? summary.current)?.focus();
    }
    if (focusContinued.current && !pendingHandoff) {
      focusContinued.current = false;
      (document.getElementById("review-frozen") ?? summary.current)?.focus();
    }
    // Dialog cancel: when a dialog closes with a stored trigger, restore
    // focus to the trigger element. The trigger ref is consumed once and
    // cleared, so the next open/cancel cycle records a fresh trigger.
    if (!discardOpen && !replaceOpen && discardTrigger.current) {
      discardTrigger.current.focus();
      discardTrigger.current = null;
    }
  }, [record?.client_submission_id, locked, pendingHandoff, discardOpen, replaceOpen]);
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
        // OD-022-10: E-019 means the server has confirmed the draft is over; the
        // submit handler has already cleared the device record. Drop React state so
        // the expired notice and back link are the only thing on screen.
        else if (result.error.error.id === "E-019") { setClearFailed(result.cleared === false); setRecord(null); setChecked(false); setExpired(true); }
      }
    }
  }
  function requestDiscard(event?: { currentTarget: EventTarget & HTMLElement }) {
    if (submitting.current) return;
    // event is optional: the button passes a real SyntheticEvent, but the
    // empty-state button and tests may call without one.
    discardTrigger.current = event?.currentTarget ?? null;
    setDiscardOpen(true);
  }
  function cancelDiscard() {
    setDiscardOpen(false);
    // The focus-restore useEffect picks up the closed dialog state and
    // returns focus to the trigger element stored in `discardTrigger`.
  }
  function confirmDiscard() {
    if (submitting.current) return;
    setDiscardOpen(false);
    const cleared = record ? clearSubmittedDraft(record.client_submission_id) : corruptAttemptedNotice ? clearSubmittedDraft(corruptAttemptedNotice) : true;
    clearSubmittedReference();
    clearIntakeMemory();
    setRecord(null); setChecked(false); setError(null);
    discardTrigger.current = null;
    if (!cleared) { setClearFailed(true); return; }
    router.push(INTAKE_PATH);
  }
  function requestReplace(event?: { currentTarget: EventTarget & HTMLElement }) {
    if (submitting.current) return;
    discardTrigger.current = event?.currentTarget ?? null;
    setReplaceOpen(true);
  }
  function cancelReplace() {
    setReplaceOpen(false);
    // See cancelDiscard: focus restore is handled by the useEffect.
  }
  function confirmReplace() {
    if (submitting.current || !record || !pendingHandoff) return;
    const fresh = createDeviceDraft(pendingHandoff);
    if (!fresh) return;
    setReplaceOpen(false);
    const saved = saveDraft(fresh, undefined, record.client_submission_id, { transition: "discard-replace", requireExisting: true });
    if (!saved) { setStorageFailed(true); return; }
    focusNewId.current = true;
    setPendingHandoff(null);
    setRecord(fresh); setStorageFailed(false); setExpired(false);
    setChecked(false); setError(null);
    setFields(validateReview(fresh));
    discardTrigger.current = null;
  }
  // The empty-state and bottom-row "delete draft" buttons both call
  // requestDiscard; the empty-state button has no event arg.

  // The discard dialog body switches to the more specific "the server may
  // have received it" warning when the draft was already attempted; the
  // title stays the standard "Delete this draft?".
  const isDiscardAttempted = Boolean(record?.attempted || corruptAttemptedNotice);
  return <div data-surface="parent" lang={locale} className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-4 pt-6 pb-12">
    <FocusHeading className="text-heading-2 font-semibold text-ink">{t.reviewTitle}</FocusHeading>
    <div className="flex flex-wrap gap-2"><HonestLabel>{t.syntheticBadge}</HonestLabel>{(success?.mock ?? record?.mock) && <HonestLabel lang="en">{t.mockLabel}</HonestLabel>}{(success?.cached ?? record?.cached) && <HonestLabel>{t.cachedBadge}</HonestLabel>}</div>
    <p role="status" aria-live="polite" aria-atomic="true" className="flex items-start gap-2 text-body-lg text-body">
      {busy ? <><LoaderCircleIcon className="mt-1 size-5" />{t.reviewSubmitting}</> : success ? <><CircleCheckIcon className="mt-1 size-5 text-success-text" />{t.reviewSubmitted.replace("{ref}", localizeDigits(success.ref, locale))}</> : !ready ? <><InfoIcon className="mt-1 size-5" />{t.stillWorking}</> : null}
    </p>
    {storageUnreadable && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewStorageUnreadable}</p>}
    {corruptAttemptedNotice && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewCorruptAttempted}</p>}
    {clearFailed && <p role="alert" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewClearFailed}</p>}
    {success ? (
      <div className="flex flex-col gap-4">
        {/* OD-022-12: S-004 exists (TASK-024), so the success screen links to it. */}
        <Link className={`${PRIMARY_BUTTON} self-start`} href={`/report/${encodeURIComponent(success.id)}`}>
          {t.reviewOpenReport}
        </Link>
        <Link className={TERTIARY_BUTTON} href={INTAKE_PATH} onClick={() => { clearSubmittedReference(); }}>
          {t.reviewBack}
        </Link>
      </div>
    ) : expired ? (
      // OD-022-10 (fix round 2, lead-authorised 2026-10-16): the record has been
      // dropped; show only the catalogue E-019 notice and the back link, with no
      // fields left on screen.
      <div ref={summary} tabIndex={-1} role="alert" aria-atomic="true" className="flex flex-col gap-3 rounded-lg border border-control bg-card p-4 text-body-lg text-body">
        <p className="flex items-start gap-2"><CircleAlertIcon className="mt-1 size-5 text-info" />{t.reviewExpired}</p>
        <Link href={INTAKE_PATH} className={TERTIARY_BUTTON}>{t.reviewBack}</Link>
      </div>
    ) : ready && !record ? <>
      <p className="text-body-lg text-body">{t.reviewEmpty}</p>
      {corruptAttemptedNotice && <button type="button" className={TERTIARY_BUTTON} onClick={requestDiscard}><TrashIcon />{t.reviewDiscardDevice}</button>}
      <Link className={TERTIARY_BUTTON} href={INTAKE_PATH}>{t.reviewBack}</Link>
    </> : record && <>
      {pendingHandoff && (
        <section role="alert" className="flex flex-col gap-3 rounded-lg border border-control bg-card p-4 text-body-lg text-body">
          <p className="flex items-start gap-2 font-medium text-ink">
            <InfoIcon className="mt-1 size-5 text-info" />
            <span>{t.earlierDraftFound}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy} className={TERTIARY_BUTTON} onClick={() => { if (submitting.current) return; focusContinued.current = true; setPendingHandoff(null); }}>
              {t.earlierDraftContinue}
            </button>
            <button type="button" disabled={busy} className={TERTIARY_BUTTON} onClick={requestReplace}>
              {t.earlierDraftReplace}
            </button>
          </div>
        </section>
      )}
      <p className="text-body-lg text-body">{t.reviewIntro}</p>
      <p className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5" />{t.reviewLocal}</p>
      {storageFailed && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewStorageFailed}</p>}
      <div id="review-required" ref={summary} tabIndex={-1} role="alert" aria-atomic="true" className={error || expired || fields.length > 0 ? "rounded-lg border border-control bg-card p-4 text-body-lg text-body" : "sr-only"}>
        {(error || expired || fields.length > 0) && <>
          <p className="flex items-start gap-2"><CircleAlertIcon className="mt-1 size-5 text-info" />{expired ? t.reviewExpired : id === "E-001" ? t.reviewErrorSummary : conflict ? t.reviewConflict : e019FromApi ? t.reviewSessionExpired : id === "E-002" ? t.reviewSession : error ? (locale === "bn" ? error.error.message_bn : error.error.message_en) : t.reviewRequiredSummary}</p>
          {fields.length > 0 && <ul className="mt-3 list-inside list-disc">{fields.map((path) => <li key={path}><a href={`#${reviewFieldInputId(path)}`} className="inline-flex min-h-11 items-center" onClick={(e) => { e.preventDefault(); document.getElementById(reviewFieldInputId(path))?.focus(); }}>{reviewLabel(path, locale)}</a></li>)}</ul>}
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
      {record.attempted && !conflict && !sessionExpired && <p id="review-frozen" tabIndex={-1} className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewRetryFrozen}</p>}
      <form noValidate onSubmit={submit} className="flex flex-col gap-6" aria-busy={busy}>
        <ReviewFields key={record.client_submission_id} record={record} locale={locale} errors={fields} onEdit={change} onBatch={changeBatch} onBlur={blur} locked={locked}
          onApprox={(value) => { if (!locked) { persist({ ...record, approximate: value }); setChecked(false); setError(null); } }} />
        <ConfirmBar locale={locale} checked={checked} valid={valid} busy={busy} blocked={conflict || sessionExpired || expired || Boolean(pendingHandoff)} mock={record.mock} describedBy={!valid ? "review-required" : undefined} onCheck={setChecked} />
      </form>
      <Link className={TERTIARY_BUTTON} href={INTAKE_PATH} aria-disabled={busy || undefined} onClick={(e) => { if (busy) e.preventDefault(); }}>{t.reviewBack}</Link>
      <Link className={TERTIARY_BUTTON} href={MANUAL_FORM_PATH} aria-disabled={busy || undefined} onClick={(e) => { if (busy) e.preventDefault(); }}>{t.reviewManualLink}</Link>
      <button type="button" disabled={busy} className={TERTIARY_BUTTON} onClick={requestDiscard}><TrashIcon />{t.reviewDiscardDevice}</button>
    </>}
    {/* In-product confirm dialogs. The native <dialog> with showModal() gives
        the OS focus trap, Escape handling and inert background for free.
        Cancelling is a no-op for storage and the router; only the explicit
        confirm button mutates. The dialogs live outside the success/expired/
        empty/record branches so every entry point (including the empty-state
        "delete draft" button) shares the same element. */}
    <dialog
      ref={discardDialog}
      aria-labelledby="review-discard-title"
      aria-describedby="review-discard-body"
      lang={locale}
      onCancel={(event) => { event.preventDefault(); cancelDiscard(); }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg border border-hairline bg-surface p-[16px] text-body shadow-2 backdrop:bg-scrim sm:p-6"
    >
      <div className="flex flex-col gap-4">
        <h2 id="review-discard-title" className="text-heading-4 font-semibold text-ink">{t.discardConfirm}</h2>
        <p id="review-discard-body" className="text-body-md text-body">{isDiscardAttempted ? t.reviewDiscardWarn : t.discardConfirm}</p>
        {isDiscardAttempted ? <p className="text-body-sm text-body">{t.reviewDiscardWarn}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={cancelDiscard} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-control bg-elevated px-5 text-body-md font-medium text-ink transition-[background-color,border-color] duration-(--duration-fast) ease-out hover:border-control-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {t.discardNo}
          </button>
          <button type="button" onClick={confirmDiscard} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5 text-body-md font-semibold text-on-primary transition-[background-color] duration-(--duration-fast) ease-out hover:bg-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {t.discardYes}
          </button>
        </div>
      </div>
    </dialog>
    <dialog
      ref={replaceDialog}
      aria-labelledby="review-replace-title"
      aria-describedby="review-replace-body"
      lang={locale}
      onCancel={(event) => { event.preventDefault(); cancelReplace(); }}
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-lg border border-hairline bg-surface p-[16px] text-body shadow-2 backdrop:bg-scrim sm:p-6"
    >
      <div className="flex flex-col gap-4">
        <h2 id="review-replace-title" className="text-heading-4 font-semibold text-ink">{t.replaceTitle}</h2>
        <p id="review-replace-body" className="text-body-md text-body">{t.replaceBody}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={cancelReplace} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-control bg-elevated px-5 text-body-md font-medium text-ink transition-[background-color,border-color] duration-(--duration-fast) ease-out hover:border-control-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {t.replaceNo}
          </button>
          <button type="button" onClick={confirmReplace} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-5 text-body-md font-semibold text-on-primary transition-[background-color] duration-(--duration-fast) ease-out hover:bg-primary-pressed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            {t.replaceYes}
          </button>
        </div>
      </div>
    </dialog>
  </div>;
}
