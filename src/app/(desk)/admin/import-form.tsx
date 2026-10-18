"use client";

// COMP-043 import panel (SCREEN-013 ACT-026 → API-015, TASK-048; D3 SCREEN-013,
// D2A API-015, FR-024, TC-014). The state machine, copy and request live in
// src/lib/admin-import.ts; this file wires them to the DOM.
//
// - Synthetic only. The form explicitly asks for a "synthetic confirmation"
//   (typed "সিমুলেটেড" / "Synthetic") so an admin cannot accidentally treat
//   this as a real public-child data import. D3: ACT-026 is a synthetic
//   import, not a public-child intake.
// - The form shows the exact protected [MOCK] fixture texts from
//   src/lib/admin-import-fixtures.ts and lets the admin select one or both
//   to import. Unknown, altered, or arbitrary text is never sent: the
//   client only ever POSTs literal fixture strings, and the server still
//   re-validates them against the same allowlist.
// - No URL fetch anywhere. The `example.invalid` TLD is reserved by RFC 2606
//   and can never resolve; we still never call fetch on it.
// - Honest copy (D4): every state is clearly labelled simulated, the
//   response is counts only, the import never returns a child or candidate
//   payload, and the synthetic badge stays visible.
import { useRouter } from "next/navigation";
import { useId, useReducer, useRef, type FormEvent, type ReactNode } from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  LoaderCircleIcon,
} from "@/app/components/icons";
import { ADMIN_IMPORT_SAMPLE_FIXTURES } from "@/lib/admin-import-fixtures";
import {
  ADMIN_IMPORT_CONFIRMATION,
  adminImportFailureText,
  initialImportState,
  IMPORT_MAX_TEXTS,
  importActionText,
  importDuplicatesText,
  importErrorText,
  importImportedText,
  importReducer,
  importSkippedText,
  requestSyntheticImport,
  syntheticImportSourceUrl,
  syntheticBadgeText,
  type AdminImportRequestInput,
} from "@/lib/admin-import";
import { locales, type Locale } from "@/locales";

const CAPTION = "text-caption-md [&:lang(bn)]:text-body-sm";

function withWord(text: string): ReactNode {
  const [before, after = ""] = text.split("{word}");
  return (
    <>
      {before}
      <span lang="en">{ADMIN_IMPORT_CONFIRMATION}</span>
      {after}
    </>
  );
}

const FIXTURE_OPTIONS: ReadonlyArray<{ kind: "missing" | "found"; key: "missing" | "found"; text: string }> = [
  { kind: "missing", key: "missing", text: ADMIN_IMPORT_SAMPLE_FIXTURES.missing },
  { kind: "found", key: "found", text: ADMIN_IMPORT_SAMPLE_FIXTURES.found },
];

export function ImportForm({
  locale,
}: {
  locale: Locale;
}) {
  const t = locales[locale];
  const router = useRouter();
  const uid = useId();
  const id = {
    title: `${uid}-title`,
    fixtures: `${uid}-fixtures`,
    sourceUrl: `${uid}-source-url`,
    confirmation: `${uid}-confirm`,
    error: `${uid}-error`,
    outcome: `${uid}-outcome`,
    intro: `${uid}-intro`,
  };
  const [state, dispatch] = useReducer(importReducer, {
    ...initialImportState,
    kind: "missing",
    selectedFixtures: ["missing", "found"],
  });
  const urlRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const busy = state.status === "submitting";

  const selectedCount = state.selectedFixtures.length;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const value = confirmationRef.current?.value ?? "";
    const next = importReducer(state, { type: "submit", value, selectedCount });
    dispatch({ type: "submit", value, selectedCount });
    if (next.status !== "submitting") {
      confirmationRef.current?.focus();
      return;
    }
    inFlight.current = true;
    // Resolve each selected fixture key against the allowlist. State is typed
    // as the two literal keys today, but a future fixture could land in state
    // from anywhere (a test, a future reducer branch, a localStorage bridge);
    // an unknown key must not crash the submit. The reducer already rejects
    // `selectedCount === 0` and `> IMPORT_MAX_TEXTS`, so this loop is the only
    // remaining shape gate.
    const items: AdminImportRequestInput["items"] = [];
    for (let index = 0; index < state.selectedFixtures.length; index += 1) {
      const key = state.selectedFixtures[index];
      if (index >= IMPORT_MAX_TEXTS) break;
      const opt = FIXTURE_OPTIONS.find((o) => o.key === key);
      if (!opt) {
        inFlight.current = false;
        dispatch({ type: "outcome", outcome: { kind: "failed", failure: { id: "E-001", seconds: null } } });
        return;
      }
      items.push({
        text: opt.text,
        source_url: syntheticImportSourceUrl(urlRef.current?.value ?? "", index),
        synthetic: true as const,
      });
    }
    const payload: AdminImportRequestInput = {
      kind: state.kind,
      fixture_intake_at: state.fixtureIntakeAt,
      items,
    };
    const outcome = await requestSyntheticImport(payload);
    inFlight.current = false;
    dispatch({ type: "outcome", outcome });
    if (outcome.kind === "ok") {
      if (urlRef.current) urlRef.current.value = "";
      if (confirmationRef.current) confirmationRef.current.value = "";
    }
    router.refresh();
  }

  const success = state.result ? importImportedText(state.result.imported, locale) : null;
  const skipped = state.result && state.result.skipped > 0 ? importSkippedText(state.result.skipped, locale) : null;
  const duplicates = state.result && state.result.duplicates_flagged > 0 ? importDuplicatesText(state.result.duplicates_flagged, locale) : null;
  const failure = state.failure ? adminImportFailureText(state.failure, locale) : null;

  const importError = importErrorText(state.lastError, locale);

  return (
    <section
      aria-labelledby={id.title}
      className="rounded-lg border border-hairline bg-surface"
    >
      <div className="flex flex-col gap-4 p-[16px] sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex size-9 items-center justify-center rounded-md bg-card text-mute"
          >
            <CircleDashedIcon />
          </span>
          <h2 id={id.title} className="text-title font-semibold text-ink">
            {t.adminImportTitle}
          </h2>
          <span className="inline-flex min-h-6 items-center rounded-xs border border-dashed border-hairline-strong px-2 text-caption-md font-medium text-body [&:lang(bn)]:text-body-sm">
            {t.adminImportSyntheticLabel}
          </span>
        </div>

        <p id={id.intro} className="text-body-sm text-body">
          {t.adminImportIntro}
        </p>

        <ul className="flex flex-col gap-2">
          {[t.adminImportNoPayload, t.adminImportNoFetch, t.adminImportNoLiveExtraction].map((fact) => (
            <li key={fact} className="flex items-start gap-2 text-body-sm text-body">
              <CircleCheckIcon className="mt-[0.2em] size-4 text-info" />
              <span className="min-w-0 [overflow-wrap:anywhere]">{fact}</span>
            </li>
          ))}
        </ul>
      </div>

      <form
        noValidate
        onSubmit={onSubmit}
        aria-labelledby={id.title}
        aria-describedby={id.intro}
        className="flex flex-col gap-4 border-t border-hairline p-[16px] sm:p-6"
      >
        <fieldset className="flex flex-col gap-2" aria-describedby={`${id.fixtures}-hint`}>
          <legend className="text-body-sm font-medium text-ink">{t.adminImportFixtureLabel}</legend>
          <p id={`${id.fixtures}-hint`} className={`text-mute ${CAPTION}`}>
            {t.adminImportFixtureHint}
          </p>
          <ul className="flex flex-col gap-2">
            {FIXTURE_OPTIONS.map((opt) => {
              const checked = state.selectedFixtures.includes(opt.key);
              const checkboxId = `${id.fixtures}-${opt.key}`;
              return (
                <li key={opt.key} className="rounded-md border border-control bg-elevated p-3">
                  <label htmlFor={checkboxId} className="flex items-start gap-2 text-body-sm text-ink">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      name="fixtures"
                      value={opt.key}
                      checked={checked}
                      onChange={(e) => dispatch({ type: "toggle_fixture", key: opt.key, checked: e.currentTarget.checked })}
                      className="mt-[0.2em] size-4 accent-control"
                    />
                    <span className="min-w-0 [overflow-wrap:anywhere] font-mono text-body-sm">{opt.text}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={id.sourceUrl} className="text-body-sm font-medium text-ink">
            {t.adminImportSourceUrlLabel}
          </label>
          <input
            ref={urlRef}
            id={id.sourceUrl}
            name="source_url"
            type="url"
            placeholder="https://example.invalid/source"
            defaultValue={state.sourceUrl}
            onInput={(e) => dispatch({ type: "input_url", value: e.currentTarget.value })}
            aria-describedby={`${id.sourceUrl}-hint`}
            className="min-h-11 rounded-md border border-control bg-elevated px-3 text-body-md text-ink focus:border-control-strong focus:shadow-1"
          />
          <p id={`${id.sourceUrl}-hint`} className={`text-mute ${CAPTION}`}>
            {t.adminImportSourceUrlHint}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={id.confirmation} className="text-body-sm font-medium text-ink">
            {withWord(t.adminImportLabel)}
          </label>
          <div className="flex flex-wrap gap-3">
            <input
              ref={confirmationRef}
              id={id.confirmation}
              name="synthetic_confirmation"
              type="text"
              lang="en"
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              aria-required="true"
              aria-invalid={state.confirmError || undefined}
              aria-describedby={[id.confirmation, state.confirmError && id.error].filter(Boolean).join(" ")}
              onInput={(e) => dispatch({ type: "input_confirm", value: e.currentTarget.value })}
              className="min-h-11 min-w-[min(12rem,100%)] flex-1 rounded-md border border-control bg-elevated px-3 text-body-md text-ink focus:border-control-strong focus:shadow-1 aria-invalid:border-danger"
            />
            <button
              type="submit"
              aria-disabled={busy || undefined}
              className="inline-flex min-h-11 max-w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-card px-5 py-2 text-start [overflow-wrap:anywhere] text-body-md font-medium text-ink transition-[transform,background-color] duration-(--duration-fast) ease-out hover:bg-card/80 active:scale-[0.97] aria-disabled:cursor-progress aria-disabled:active:scale-100"
            >
              {busy ? <LoaderCircleIcon className="size-4 animate-spin motion-reduce:animate-none" /> : <CircleDashedIcon className="size-4" />}
              <span>{importActionText(locale)}</span>
            </button>
          </div>
          <div role="alert" aria-atomic="true">
            {state.confirmError && (
              <p
                key={state.confirmAttempts}
                id={id.error}
                className={`flex items-start gap-1.5 text-danger-text ${CAPTION}`}
              >
                <CircleAlertIcon className="mt-[0.2em] size-3.5" />
                <span>{importError}</span>
              </p>
            )}
          </div>
        </div>

        <div ref={undefined} tabIndex={-1} className="outline-none">
          <div role="status" aria-live="polite" aria-atomic="true">
            {busy && (
              <p className="mb-3 flex items-start gap-2 text-body-sm text-body">
                <LoaderCircleIcon className="mt-[0.2em] size-4 animate-spin motion-reduce:animate-none" />
                <span>{t.adminImportImporting}</span>
              </p>
            )}
            {success && (
              <div className="mb-3 flex items-start gap-2 rounded-md bg-success-soft px-3 py-2.5 text-body-sm text-success-text">
                <CircleCheckIcon className="mt-[0.2em] size-4" />
                <div>
                  <p className="font-medium">{success}</p>
                  {skipped && <p className="block">{skipped}</p>}
                  {duplicates && <p className="block">{duplicates}</p>}
                  <p className="block text-faint">{syntheticBadgeText(locale)}</p>
                </div>
              </div>
            )}
            {selectedCount === 0 && !busy && (
              <p className="mb-3 text-body-sm text-faint">{t.adminImportEmpty}</p>
            )}
          </div>
          <div role="alert" aria-atomic="true">
            {failure && (
              <p className="mb-3 flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2.5 text-body-sm text-danger-text">
                <CircleAlertIcon className="mt-[0.2em] size-4" />
                <span>{failure}</span>
              </p>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}
