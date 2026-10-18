"use client";

// SCREEN-003 edit-mode (P3-035/ACT017; D3 §3 row 142 ACT-017, D2A §5.3/API-005,
// D2A §5.4/API-004; FR-029, BR-004/025). The "Correct details" lane on S-006
// records a device-local edit pointer and routes here. This screen:
//
//   1. reads the device-local edit pointer (edit-handoff.ts),
//   2. fetches the canonical owner view (API-004, src/lib/intake/owner-case.ts),
//   3. hydrates a device-local edit draft (edit-draft-store.ts), preserving the
//      case UUID and the version the parent saw at click time,
//   4. reuses the existing ReviewFields/ConfirmBar (the regular create flow's
//      components) to render the form, so the field UX is identical,
//   5. on submit PATCHes /api/cases/:id (edit-review.ts) — never POSTs a new
//      report. A stored [MOCK] fake can never reach the network.
//
// Safety:
//   - editable: false in the API-004 response, or draft: null → render the
//     locked copy (E-018). The PATCH is not even attempted.
//   - expectedVersion from API-004 is the version the PATCH carries. A server
//     change between the API-004 read and the PATCH returns E-005; the local
//     record is kept so the parent can re-read API-004 and retry.
//   - E-024 keeps the local edit draft (offline retained), so the parent can
//     retry without losing the corrections.
//   - Success clears the edit pointer AND the local edit draft, then routes
//     to /status. A refresh after the route does not re-enter edit mode.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorEnvelope, type DraftFieldPath, type ErrorEnvelope } from "@/contracts";
import { CircleAlertIcon, InfoIcon, LoaderCircleIcon } from "@/app/components/icons";
import { FocusHeading } from "@/app/components/focus-heading";
import { type DeviceDraft } from "@/lib/intake/draft-store";
import { clearEditMode, readEditMode } from "@/lib/intake/edit-handoff";
import {
  clearEditDraft,
  editDraftFromOwnerView,
  editDraftToDeviceDraft,
  loadEditDraft,
  refreshEditDraftAfterConflict,
  readEditDraft,
  saveEditDraft,
  type EditDeviceDraft,
} from "@/lib/intake/edit-draft-store";
import { buildEditSubmission, createEditSubmitter, editField, validateEditReview } from "@/lib/intake/edit-review";
import { fetchOwnerCase } from "@/lib/intake/owner-case";
import { parentIntakeBn, parentIntakeEn } from "@/locales/areas/parent-intake";
import { localizeDigits } from "@/lib/numerals";
import { locales, type Locale } from "@/locales";
import { CircleCheckIcon, HonestLabel, PRIMARY_BUTTON, TERTIARY_BUTTON, TrashIcon } from "../../parent-ui";
import { ConfirmBar, ReviewFields, reviewFieldInputId, reviewLabel } from "./review-fields";

const EDIT_LOCALE = { bn: parentIntakeBn, en: parentIntakeEn };

// Look up the edit copy by locale, falling back to the shared root locales so
// fields the area file does not own (e.g. the source-span reveal) still render.
function tFor(locale: Locale) {
  const shared = locales[locale];
  return { ...shared, ...EDIT_LOCALE[locale] };
}

type EditPhase =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; record: EditDeviceDraft }
  | { kind: "error"; error: ErrorEnvelope };

export function EditModeScreen({ locale }: { locale: Locale }) {
  const t = tFor(locale);
  const router = useRouter();
  // Read the device-local pointer exactly once on first render. A late write
  // does not re-enter edit mode (StrictMode/effect replay).
  const editPointer = useRef<{ value: ReturnType<typeof readEditMode> } | null>(null);
  // eslint-disable-next-line react-hooks/refs -- mandated once-per-consumer guard
  if (editPointer.current === null) editPointer.current = { value: readEditMode() };
  const pointer = editPointer.current.value;
  const [phase, setPhase] = useState<EditPhase>({ kind: "loading" });
  const [fields, setFields] = useState<DraftFieldPath[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ErrorEnvelope | null>(null);
  const [success, setSuccess] = useState<{ ref: string } | null>(null);
  const [storageFailed, setStorageFailed] = useState(false);
  const active = useRef(true);
  const submitting = useRef(false);
  const submitter = useRef<ReturnType<typeof createEditSubmitter> | null>(null);
  const refreshController = useRef<AbortController | null>(null);
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      refreshController.current?.abort();
      refreshController.current = null;
    };
  }, []);

  // No pointer: the parent did not come from S-006 "Correct details" or the
  // pointer was stale and swept. Render the empty copy and a back link.
  useEffect(() => {
    if (!pointer) {
      setPhase({ kind: "empty" });
      return;
    }
    const controller = new AbortController();
    void (async () => {
      // 1) try the local edit draft first (already hydrated from API-004 in a
      //    previous visit) so the parent does not pay a second round trip.
      const stored = readEditDraft();
      if (stored.draft && stored.draft.caseId === pointer.caseId && !stored.unreadable) {
        if (active.current) {
          setPhase({ kind: "ready", record: stored.draft });
          setFields(validateEditReview(stored.draft));
        }
        return;
      }
      // 2) fetch API-004 to learn the live case view; hydrate the local draft.
      const result = await fetchOwnerCase(pointer.caseId, controller.signal);
      if (!active.current || controller.signal.aborted) return;
      if (!result.ok) {
        // E-002 means the parent session is over (clear the pointer and the
        // draft, but show the catalogue copy). E-004/E-005/E-018 stay.
        if (result.error.error.id === "E-019" || result.error.error.id === "E-002") {
          clearEditDraft();
          clearEditMode();
        }
        setPhase({ kind: "error", error: result.error });
        return;
      }
      if (!result.data.editable || result.data.draft === null) {
        // E-018: the case is locked; the parent tapped Correct on a case that
        // became terminal between the status read and this page load. Lock the
        // screen, do not even hydrate.
        setPhase({ kind: "error", error: errorEnvelope("E-018") });
        return;
      }
      const hydrated = editDraftFromOwnerView(result.data);
      if (!hydrated) {
        setPhase({ kind: "error", error: errorEnvelope("E-018") });
        return;
      }
      // Re-read the pointer's expectedVersion (if it was set) for an early
      // E-005 if a server change happened between the status card read and
      // this page load. The PATCH carries `view.version`, which is also live;
      // the two are equal until the parent starts editing.
      const saved = saveEditDraft(hydrated);
      if (!saved) setStorageFailed(true);
      if (active.current) {
        setPhase({ kind: "ready", record: hydrated });
        setFields(validateEditReview(hydrated));
      }
    })();
    return () => controller.abort();
  }, [pointer]);

  // Surface error / locked states through the summary role.
  useEffect(() => {
    if (error) summary.current?.focus();
  }, [error]);

  if (phase.kind === "loading") {
    return (
      <div data-surface="parent" lang={locale} className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-4 pt-6 pb-12">
        <FocusHeading className="text-heading-2 font-semibold text-ink">{t.reviewEditTitle}</FocusHeading>
        <p role="status" aria-live="polite" className="flex items-start gap-2 text-body-lg text-body">
          <LoaderCircleIcon className="mt-1 size-5" />{t.reviewEditLoading}
        </p>
      </div>
    );
  }
  if (phase.kind === "empty") {
    return (
      <div data-surface="parent" lang={locale} className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-4 pt-6 pb-12">
        <FocusHeading className="text-heading-2 font-semibold text-ink">{t.reviewEditTitle}</FocusHeading>
        <p className="text-body-lg text-body">{t.reviewEditEmpty}</p>
        <Link className={TERTIARY_BUTTON} href="/status">{t.reviewEditBack}</Link>
      </div>
    );
  }
  if (phase.kind === "error") {
    const id = phase.error.error.id;
    const copy = id === "E-018" ? t.reviewEditLocked
      : id === "E-005" ? t.reviewEditStale
      : id === "E-002" ? t.reviewEditForbidden
      : id === "E-004" ? t.reviewEditForbidden
      : id === "E-024" ? t.reviewEditOffline
      : (locale === "bn" ? phase.error.error.message_bn : phase.error.error.message_en);
    const note = id === "E-018" ? <p className="text-body-md text-body">{t.reviewEditLockedNote}</p> : null;
    const action = id === "E-024" ? (
      <Link className={TERTIARY_BUTTON} href="/status">{t.reviewEditBack}</Link>
    ) : (
      <button type="button" className={TERTIARY_BUTTON} onClick={() => router.back()}>{t.reviewEditBack}</button>
    );
    return (
      <div data-surface="parent" lang={locale} className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-4 pt-6 pb-12">
        <FocusHeading className="text-heading-2 font-semibold text-ink">{t.reviewEditTitle}</FocusHeading>
        <div ref={summary} tabIndex={-1} role="alert" aria-atomic="true" className="flex flex-col gap-3 rounded-lg border border-control bg-card p-4 text-body-lg text-body">
          <p className="flex items-start gap-2"><CircleAlertIcon className="mt-1 size-5 text-info" />{copy}</p>
          {note}
          {action}
        </div>
      </div>
    );
  }

  const record = phase.record;
  const view: DeviceDraft = editDraftToDeviceDraft(record);
  const id = error?.error.id;
  const conflict = id === "E-005";
  const sessionExpired = id === "E-002" || id === "E-019";
  const offline = id === "E-024";
  const mockBlocked = record.mock === true;
  const locked = busy || record.attempted || sessionExpired || conflict || mockBlocked;
  const valid = !mockBlocked && buildEditSubmission(record, true) !== null;

  function persist(next: EditDeviceDraft) {
    const saved = saveEditDraft(next);
    setStorageFailed(!saved);
    // Keep the controlled fields in sync with the device copy. The owner view
    // is immutable, so without this state update a keystroke only reached
    // localStorage and the rendered form/submit body kept the old values.
    setPhase({ kind: "ready", record: next });
  }
  function change(path: DraftFieldPath, value: string) {
    if (!record || locked) return;
    persist(editField(record, path, value));
    setChecked(false);
    setError(null);
    setFields([]);
  }
  function changeBatch(edits: Partial<Record<DraftFieldPath, string>>, approximate?: boolean) {
    if (!record || locked) return;
    persist({ ...record, edits: { ...record.edits, ...edits }, ...(approximate === undefined ? {} : { approximate }) });
    setChecked(false); setError(null); setFields([]);
  }
  function blur(path: DraftFieldPath) {
    if (!record || locked) return;
    setFields(validateEditReview(record));
    void path;
  }
  async function refreshAfterConflict() {
    if (!record || !conflict || refreshing || submitting.current) return;
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    setRefreshing(true);
    const result = await fetchOwnerCase(record.caseId, controller.signal);
    if (!active.current || controller.signal.aborted) return;
    refreshController.current = null;
    setRefreshing(false);
    if (!result.ok) {
      if (result.error.error.id === "E-018" || result.error.error.id === "E-019") {
        clearEditDraft();
        clearEditMode();
        setPhase({ kind: "error", error: result.error });
      } else {
        setError(result.error);
      }
      return;
    }
    if (!result.data.editable || result.data.draft === null) {
      const lockedError = errorEnvelope("E-018");
      clearEditDraft();
      clearEditMode();
      setPhase({ kind: "error", error: lockedError });
      return;
    }
    const fresh = editDraftFromOwnerView(result.data);
    if (!fresh) {
      const lockedError = errorEnvelope("E-018");
      clearEditDraft();
      clearEditMode();
      setPhase({ kind: "error", error: lockedError });
      return;
    }
    const next: EditDeviceDraft = {
      ...fresh,
      edits: record.edits,
      approximate: record.approximate,
      attempted: false,
      savedAt: Date.now(),
      expiresAt: record.expiresAt,
    };
    if (!refreshEditDraftAfterConflict(record, next)) {
      setStorageFailed(true);
      setError(errorEnvelope("E-024"));
      return;
    }
    setPhase({ kind: "ready", record: next });
    setFields(validateEditReview(next));
    setChecked(false);
    setError(null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!record || submitting.current || success || conflict || sessionExpired || mockBlocked) return;
    if (!checked) {
      setError(errorEnvelope("E-001", { fields: validateEditReview(record) }));
      return;
    }
    if (record.expiresAt <= Date.now()) {
      clearEditDraft();
      clearEditMode();
      setPhase({ kind: "error", error: errorEnvelope("E-019") });
      return;
    }
    submitting.current = true; setBusy(true); setError(null); setFields([]);
    submitter.current ??= createEditSubmitter(fetch, undefined);
    const result = await submitter.current(record, true, true);
    submitting.current = false;
    if (!active.current) return;
    if (result?.ok) {
      // Success: clear the pointer and the local edit draft, then navigate to
      // /status. The pointer is gone, so a refresh does not re-enter edit
      // mode. The status page reads API-018 and shows the updated record.
      clearEditMode();
      setSuccess({ ref: result.data.ref_code });
      setBusy(false);
      router.push("/status");
      return;
    }
    setBusy(false);
    if (result) {
      setError(result.error);
      if (result.error.error.id === "E-005" || result.error.error.id === "E-018" || result.error.error.id === "E-019") {
        // E-005/E-018/E-019: the local draft is no longer live. E-005 keeps
        // it for an explicit re-read; E-018/E-019 drop it.
        if (result.error.error.id === "E-018" || result.error.error.id === "E-019") {
          clearEditDraft();
          clearEditMode();
        }
      }
    }
  }
  function discard() {
    if (submitting.current) return;
    if (!window.confirm(t.reviewEditDiscard)) return;
    clearEditDraft();
    clearEditMode();
    router.push("/status");
  }

  if (success) {
    // The router.push has already fired; the brief success state is the only
    // thing on screen during the transition (a parent who screenshots here
    // sees the "Correction submitted" copy).
    return (
      <div data-surface="parent" lang={locale} className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-4 pt-6 pb-12">
        <FocusHeading className="text-heading-2 font-semibold text-ink">{t.reviewEditTitle}</FocusHeading>
        <p role="status" className="flex items-start gap-2 text-body-lg text-body">
          <CircleCheckIcon className="mt-1 size-5 text-success-text" />{t.reviewEditSubmitted}
          {" "}
          <span className="font-mono tracking-[-0.03em] tabular-nums">{localizeDigits(success.ref, locale)}</span>
        </p>
        <Link className={PRIMARY_BUTTON} href="/status">{t.reviewEditBack}</Link>
      </div>
    );
  }

  return (
    <div data-surface="parent" lang={locale} className="mx-auto flex w-full max-w-[30rem] flex-col gap-6 px-4 pt-6 pb-12">
      <FocusHeading className="text-heading-2 font-semibold text-ink">{t.reviewEditTitle}</FocusHeading>
      <div className="flex flex-wrap gap-2">
        <HonestLabel>{t.syntheticBadge}</HonestLabel>
        {mockBlocked && <HonestLabel lang="en">{t.mockLabel}</HonestLabel>}
      </div>
      <p className="text-body-lg text-body">{t.reviewEditIntro}</p>
      {storageFailed && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewStorageFailed}</p>}
      {mockBlocked && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewEditMockBlocked}</p>}
      {offline && <p role="status" className="flex items-start gap-2 text-body-lg text-body"><InfoIcon className="mt-1 size-5 text-info" />{t.reviewEditOffline}</p>}
      <div id="review-edit-required" ref={summary} tabIndex={-1} role="alert" aria-atomic="true" className={error || conflict || sessionExpired || fields.length > 0 ? "rounded-lg border border-control bg-card p-4 text-body-lg text-body" : "sr-only"}>
        {(error || conflict || sessionExpired || fields.length > 0) && <>
          <p className="flex items-start gap-2"><CircleAlertIcon className="mt-1 size-5 text-info" />{
            conflict ? t.reviewEditConflict
            : sessionExpired ? t.reviewEditForbidden
            : offline ? t.reviewEditOffline
            : fields.length > 0 ? t.reviewRequiredSummary
            : error ? (locale === "bn" ? error.error.message_bn : error.error.message_en)
            : t.reviewRequiredSummary
          }</p>
          {fields.length > 0 && <ul className="mt-3 list-inside list-disc">{fields.map((path) => <li key={path}><a href={`#${reviewFieldInputId(path)}`} className="inline-flex min-h-11 items-center" onClick={(e) => { e.preventDefault(); document.getElementById(reviewFieldInputId(path))?.focus(); }}>{reviewLabel(path, locale)}</a></li>)}</ul>}
          {conflict && <button type="button" disabled={refreshing} className={TERTIARY_BUTTON} onClick={() => void refreshAfterConflict()}>{refreshing ? t.reviewEditRefreshing : t.reviewEditReload}</button>}
        </>}
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-6" aria-busy={busy}>
        <ReviewFields key={record.caseId} record={view} locale={locale} errors={fields} onEdit={change} onBatch={changeBatch} onBlur={blur} locked={locked}
          onApprox={(value) => { if (!locked) { persist({ ...record, approximate: value }); setChecked(false); setError(null); } }} />
        <ConfirmBar locale={locale} checked={checked} valid={valid} busy={busy} blocked={conflict || sessionExpired || mockBlocked} mock={mockBlocked ? true : undefined} describedBy={!valid ? "review-edit-required" : undefined} onCheck={setChecked} />
      </form>
      <Link className={TERTIARY_BUTTON} href="/status" aria-disabled={busy || undefined} onClick={(e) => { if (busy) e.preventDefault(); }}>{t.reviewEditBack}</Link>
      <button type="button" disabled={busy} className={TERTIARY_BUTTON} onClick={discard}><TrashIcon />{t.reviewEditDiscard}</button>
    </div>
  );
}
