# TASK-022 part 2 evidence — SCREEN-003 review and device-local draft

Owner: Obidit · Tool: Codex · Lane: `obidit-review-ui` · Branch: `phase2--obidit-review-ui`, stacked on TASK-021 · Base HEAD: `98a60c2` · Date: 2026-10-16 (Asia/Dhaka).

Links: TASK-022, FR-006/007/031/033, BR-004/008/015/016/023, TC-004/031; D3 SCREEN-003/005; D4 parent rules; [API-003 evidence](intake-submit-api.md), [TASK-021 evidence](intake-ui.md), contract notes OD-015-1/4.

Synthetic fixtures only. No `.env*` reads, external network/provider calls, dependencies, commits, pushes, PRs or deployment. The only network test was the authorised local PostgreSQL runner. No SQL, contracts, API routes, other owners' runtime files, frozen spec copies or manifest were changed.

## Status and done-when scope

**Part-2 implementation is ready for lead review; TASK-022 remains `in progress`.** The local client and DB assertions below pass. The complete TC-004/031 browser journey was not run, and `/report/<id>` is a Planned destination belonging to Mahim's TASK-024 / PR #26. Do not turn this evidence into an end-to-end TC or preview-deploy acceptance claim.

| Criterion | Passing local evidence | Not established |
|---|---|---|
| TC-004: review before submit, edited clothing stored | New Node hook/client tests: mounting, invalid or unchecked submission and checking alone dispatch no request; editing resets confirmation; the explicit checked submission sends parent-edited clothing without its old evidence span. Existing `tests/db/submit.test.ts` ran: unconfirmed requests leave case/audit/candidate counts unchanged; confirmed edited clothing is stored as open. | Actual phone/browser editing, checkbox, officer queue inspection and one integrated client-to-DB journey were not run. |
| TC-031: identical replay, stable reference, changed payload conflicts | Client tests: E-021/E-024 reuse the same UUID/body, including reload; both 200 and 201 clear the stored draft and UUID. Node screen test displays the returned reference and requests `/report/<id>`. Existing DB submit suite ran: identical/concurrent submissions give one 201 and one 200, stable ID/reference, one row; changed payload gives E-006. | Existing-reference display is verified in the Node component harness with mocked navigation, not in a real browser or S-004. S-004 is not built in this lane. |

## Files and behaviour

| Files | What changed |
|---|---|
| `src/app/(parent)/intake/review/page.tsx` | Locale-aware route and metadata. It renders the client `ReviewScreen`. |
| `src/app/(parent)/intake/review/review-screen.tsx` | Documented ref/lazy-initializer `takeHandoff()` guard, including null. Restore after hydration; an unresolved persisted attempt takes priority over a fresh handoff. Honest loading/empty/storage-failure states. Required-field summary before blur, error-summary focus, explicit confirmation, one synchronous busy guard, submission status, E-001/E-006/E-002/E-019/retry recovery, reference and Planned report target. Confirmed device discard clears this draft and intake memory. |
| `src/app/(parent)/intake/review/review-fields.tsx` | COMP-028 cards for every contract draft field path plus approximation control. Source-order cards, visible label/input, literal unknown text, optional sex choices, exact/range age guidance, required markers, connected field errors, free-text language tags, Bangla numeric display. Every unedited known field shows the full canonical source with the exact UTF-16 evidence span highlighted. Missing spans are disclosed. Additional/unprocessed handoff words are preserved alongside each prefilled card and once above the form. Edits are marked as parent edits and remove the submitted field's old evidence span. COMP-029 contains the checkbox and one primary submit, disabled until checked and contract-valid. |
| `src/lib/intake/draft-store.ts` | Versioned `fera.intake.review.v1` localStorage record: structural draft, full handoff source, raw parent edits (including incomplete/invalid input), UUID, timestamp, token, supplied expiry, approximation and honest mock/cache flags, attempted state. Every storage operation/getter is guarded. Corrupt/version-mismatched/expired/future-dated records are cleared on access. Unavailable storage is distinguishable from empty storage. Guarded writes/deletes preserve replacement drafts; attempted snapshots reject changed same-UUID content and implicit thawing. |
| `src/lib/intake/review.ts` | Frozen-contract validation/building, decimal/Bangla numeric input, phone normalization via contract, unknown preservation, evidence removal on parent edits, mapping approximation errors to a visible time field. Sole POST seam: `/api/cases`, same-origin credentials, `{draft, confirmed:true, client_submission_id, draft_token?}`. Validates success/error envelopes, reconstructs catalogue error copy, never renders arbitrary server messages or logs payloads. 25-second timeout reuses the existing intake constant. |
| `src/locales/index.ts` | 40 review keys in each language, including loading/empty/errors, privacy/discard copy, source labels and interim integration limits. New Bangla marked for human review; D3/D4 strings cite their sources. |
| `tests/intake/review/{draft-store,submit-client,review-lifecycle}.test.ts`, `storage.ts`; `tests/ui/review-screen.test.ts` | 75 new tests in four suites; dependency-free Node hook harness and static React rendering follow TASK-021 style. `storage.ts` is a test-only storage fake. |

### Error and retry policy

- E-001: mapped field errors and correction summary; a definite validation refusal may thaw the identical saved attempt. `event.at_approx` issues map locally to `event.at`; no frozen contract change.
- E-006: changed-payload conflict, per actual route/OD-015-1. Warn that a new ID may create a separate report. Only the explicit new-ID action unlocks review and persists a fresh UUID; confirmation resets.
- E-002/E-019: preserve the local draft, explain session expiry, link to `/intake`. API-003 may return E-002 for an expired session, not only E-019.
- E-021/E-024, malformed success, or uncertain response: keep UUID and payload frozen for an identical retry. A known stored draft must be durably frozen before dispatch; failure blocks dispatch and shows a storage warning. Stale tabs cannot ordinarily rewrite/thaw a frozen snapshot or recreate a removed known saved draft.
- 200/201: clear this record, including UUID, before navigation. A completed old request does not erase a replacement draft. If deletion is unavailable/fails, show the successful reference and explicit site-data cleanup warning with the Planned report link; automatic navigation is withheld so the warning remains visible.
- Memory-only operation remains usable when storage was unavailable from the outset, with a visible warning that closing the page may lose work. Its successful reference and Planned link remain available when deletion cannot be verified.

## Tests first and verification

Observed RED before implementation: initial three suites failed on missing draft-store/review/field modules; lifecycle suite failed on missing screen. Subsequent reviewer regressions were observed failing for stale-tab writes, persistence failure, lost pending UUID, undiscoverable required fields and approximation mapping, then passed after fixes. Same-UUID frozen snapshot and removed-record regressions also failed before their fixes. Additional full handoff source regression failed before its card rendering was added. No checkpoint commits were made, per the user's no-commit instruction.

| Command | Exit | Result |
|---|---|---|
| `npx --no-install vitest run tests/intake/review tests/ui/review-screen.test.ts` | 0 | **75/75**, four files |
| `npm run lint` | 0 | No errors or warnings |
| `npm run typecheck` | 0 | Next route generation and strict TypeScript pass |
| `npm test` | 0 | **1,761 passed, 142 skipped**, 79 files: 72 passed / 7 DB suites skipped; no auth timing flake in the final run |
| `npm run test:db` | 0 | **142/142** local PostgreSQL 16.15 / pgvector 0.8.1: platform 48, redaction 18, auth 13, case 38, outputs 4, submit 10, admin 11. Existing suites, unchanged in this lane. |
| `npm run build` | 0 | Production build includes dynamic `/intake/review`; Planned `/report/<id>` and `/intake/form` absent |
| `impeccable detect --json --target 'src/app/(parent)/intake/review'` | 0 | `[]`; mechanical/source result only |
| `git diff --check`; scoped source scan | 0 | Clean diff; no added payload logging, secret handling or red/danger tokens. No forbidden-path edits. |

No coverage percentage was measured; no coverage dependency was added. Fera's D6 test-count target applies. Final command logs were captured under `/tmp/review-*-final.log` during this run; the DB log is `/tmp/review-db.log`.

## Reviews and design documentation

Applied TDD, React, accessibility, security-review, Impeccable, verification-loop and fera-review guidance. Reviews were independent, read-only Codex subagents; no worker wrote code in this worktree.

| Reviewer | Final source result |
|---|---|
| Fera safeguarding | PASS after pending-UUID and same-UUID frozen-snapshot blockers were fixed; reviewer independently ran the 74-test suite before the final additional-source test (now 75). |
| TypeScript | PASS after stale writes, required persistence and approximation fixes |
| React | PASS, including final restore/locking/source-rendering changes |
| Accessibility | PASS at source level after required summary and age-alternative fixes |
| Bengali | PASS for automated code/i18n review; **human copy review is still pending** |
| Silent failure | PASS after late E-001, unreadable storage and same-ID stale-tab fixes |
| Security | PASS; shared browser-profile/same-origin storage exposure remains an explicit inherent risk |
| Impeccable finish | **recapture**, not a visual pass: desktop/mobile screenshots missing. No browser/screenshots were run. |
| Impeccable documenter | Existing Paper system preserved; no new tokens/assets or DESIGN change needed. Undefined title class was corrected to the existing 26px `text-heading-2`. Pre-existing design-doc/sidecar drift was reported, not repaired. |

**FERA-REVIEW:** safeguarding and applicable code-review gates PASS at their source/test scope. Whole-surface visual finish approval remains pending; do not describe `recapture` as PASS.

Direction contract for this extension: **THESIS:** one calm review decision supported by the parent's own words. **OWN-WORLD:** inherited Paper canvas/white cards/blue action/neutral errors, existing Inter/Noto Sans Bengali and shared parent controls. **STORY:** read every detail, complete known mandatory facts, confirm, explicitly submit. **FIRST VIEWPORT:** focusable review title, synthetic/mock/cache labels, privacy notice and any required-field summary before the source-order cards; confirm/discard follow the fields. **FORM:** task-mandated field cards and confirm bar, established-world extension; no concept seed or new visual identity. **FINISH:** source review and design preservation checked; browser visual finish remains open because captures are absent.

## Open decisions and integration limits

- **OD-022-9 Four-round exit / D3 conflict:** keep TASK-021 unchanged: its `manual` handoff routes to Planned `/intake/form`, following D3 line ~483 rather than line ~69's S-003 wording (OD-021-7). Review accepts drafts with missing fields and lets the parent complete them. Its explicit Planned manual-form link preserves the versioned saved record; it does not send a null-draft handoff or fabricate extraction metadata. TASK-025 must consume the shared store, including raw edits, before that link is an integrated workflow. No S-005 was built and no spec file edited.
- **OD-022-10 Device/privacy policy:** single active record per browser profile; plaintext device storage is readable by other users of that profile and same-origin scripts. The visible discard action and privacy copy are implemented. Supplied API-002 expiry is used exactly; expiry clears on access, not while a browser is closed. No audio is persisted. The team must approve retention/shared-device behaviour. A handoff without an extraction does not invent a draft or expiry.
- **OD-022-11 Full-source provenance:** baseline searches for `OD-013-11` / `OD-013-14` in `docs/` and `specs/` returned no matches at HEAD `98a60c2`. This lane follows the user's explicit full-source requirement and frozen UTF-16 evidence contract. Canonical `draft.source_text` remains unchanged; extra handoff words remain separately labelled, without fabricated span offsets. Parent edits carry no old source span. Owners should reconcile the missing decision references with the extraction lane.
- **OD-022-12 S-004 route:** `/report/<id>` is the user-specified Planned target (Mahim TASK-024 / PR #26). Navigation and reference rendering are unit-tested with a mocked router; target availability/integration is **UNKNOWN** on this lane. No S-004 code was touched.
- **OD-022-13 Bangla review sheet:** the new `review*` keys added in this change are marked under the SCREEN-003 comment as needing human Bangla review. Review the privacy/deletion messages, unknown/evidence explanations, required/exact-or-range guidance, conflict/new-ID wording, storage/session recovery, Planned labels, and date/district instructions. D3's `reviewChecked`, `reviewSubmit`, `reviewSubmitting` and D4 age/phone validation copy cite their sources; those still need contextual reading. Automated Bengali approval does not replace human review.
- **OD-022-14 District/time controls:** this checkout has no named district catalogue (OD-021-9); the normaliser requires an injected lookup. The review form exposes explicitly labelled synthetic district numbers 1–64 and says not to guess. District text is not guessed into a code. D4's searchable named list requires TASK-009 integration. Times are editable ISO text with localized digits/instructions, supporting exact and bounded times; D4's friendlier date/part-of-day controls and phone usability are not verified. These remain UX/integration limits, not evidence of full D4 completion.
- **OD-022-15 Persistence failure and concurrency:** pending saved attempts take priority over fresh intake, and ordinary writes protect UUID and frozen content. localStorage read/compare/write is **not an atomic cross-tab transaction**; PostgreSQL idempotency remains authoritative. When known persistence fails, dispatch is blocked; when storage never worked, only memory retry is possible and the user sees the close-page warning. Failed success/discard deletion remains visible and requires manual browser-site-data cleanup; auto-navigation is withheld in that failure case. Team approval is needed for this fallback policy.
- **OD-022-16 Remaining API decisions:** OD-022-1–8 and OD-015-4 are not resolved by UI. Draft tokens are schema-valid but unverified by this API; no session is minted by API-003; TASK-021 defaults to a labelled fake and cannot establish a live parent session. Confirmed expiry/deletion clears client identity as requested, but does not create the server tombstone needed to prevent all redaction-era stale replays. A pending attempt lost through expiry/storage loss remains a recovery-policy question for the owners.
- **OD-022-17 Acceptance still needed:** browser/phone TC-004/031 with a live session and working S-004, keyboard focus/screen-reader/320px/200% zoom/contrast checks, human Bangla review and visual finish captures. No browser metrics, screenshots or acceptance results are invented. These limits keep the overall tracker `in progress` despite passing local assertions and code-review gates.
