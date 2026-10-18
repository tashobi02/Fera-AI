# TASK-025 evidence — SCREEN-005 manual case form (AI fallback)

Owner: Mahim · Lane: `mahim-manual-form` (Claude Code), branch `phase2--mahim-manual-form`, stacked on `phase2--mahim-parent-session` (#32), which is on `phase2--mahim-outputs` (#26) · Date: 2026-10-17 (Asia/Dhaka) · Links: TASK-025, COMP-032, COMP-044, STORY-018, FR-026, BR-004, BR-023, TC-017, D3 SCREEN-005, OD-022-5, OD-022-14.

All data is synthetic. Nothing was deployed and no hosted database was touched.

## Status against "Done when TC-017 passes"

TC-017: with the LLM keys invalidated, the parent submits text; the manual form opens pre-filled with any parsed fields within 2 s of the error, and the text is kept.

**Partly met.**
- **Done:**
  - S-005 exists at `/intake/form`. It is reachable from S-002 (ACT-014 "ফর্ম খুলুন") and from S-003.
  - It pre-fills any parsed fields from a real API-002 response.
  - It always keeps the parent's text: the "কী ঘটেছিল (আপনার কথায়)" field holds it when it fits in 500 characters, and it is shown whole beside the form in all cases.
- **Not done:**
  - **Automatic opening.** After two failed extractions or an AI service error, S-002 (TASK-021, Obidit) shows the hand-off note and the "ফর্ম খুলুন" link, but does not navigate to S-005 by itself.
  - **The ≤ 2 s timing.** Not measured.
  - **A real provider failure.** Not exercised: API-001/002 are not built, and S-002 runs on the `[MOCK]` client.

## What was built

| Area | Files | Notes |
|---|---|---|
| Draft rules | `src/lib/intake/manual.ts` | `manualDraft(handoff)`: a real API-002 response pre-fills its draft, evidence and draft token, with the shorter expiry. A **`[MOCK]` hand-off keeps only the parent's own words, never sample values**, so a fake answer can never be submitted. `manualFromStored` restarts a stored `[MOCK]` draft the same way. The result is always `mock: false`, the parent's own draft. |
| Screen | `src/app/(parent)/intake/form/{page,manual-form}.tsx` | The same fields as S-003 (`ReviewFields`): one per row, fieldsets, Bangla digits, part-of-day chips, the `[MOCK]` district number until TASK-009 (OD-022-14). Every edit is saved on the device only; nothing reaches the server. ACT-005 "পরের ধাপ" checks the required fields (E-001 inline summary with links to each field) and opens S-003, where the parent confirms and submits (BR-004). An attempted submission on the device is never overwritten; S-005 points to S-003 instead. ACT-015 discard asks first, then clears the device draft and the intake memory. |
| Links | `intake-chat.tsx` (S-002), `review-screen.tsx` (S-003), `handoff.ts` | The "ফর্ম খুলুন" link loses its Planned label. S-003 gains "ফর্মে তথ্য বদলান", which edits the same device draft. |
| S-003 reference | `review-screen.tsx` | The success line showed the reference with Bangla digits ("M-০X৬X৪D") while S-004, the GD and the poster show "M-0X6X4D". The reference is an identifier, so it now stays as issued (`lang="en"`, mono). |
| Copy | `src/locales/index.ts` | 11 keys in bn and en. `manualNext` is D3 ACT-005 "পরের ধাপ"; `manualSyntheticNote` is the D4 §15.1 provider notice's second sentence. The others need human Bangla review. |

## Verification (2026-10-17, local)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 2843 passed, 187 skipped on Node 22 and on Node 24; 18 new in `tests/intake/manual/` |
| `npm run build` | 0 | routes include `/intake/form`, `/intake/review`, `/report/[id]` |

New tests (18):
- `tests/intake/manual/manual.test.ts` (9):
  - An empty draft is valid and all-unknown.
  - A real hand-off pre-fills its draft, token and expiry.
  - A `[MOCK]` hand-off copies no values and keeps the words; long words are not cut.
  - A failure hand-off with no response keeps the words; a stored `[MOCK]` draft restarts.
  - The required fields are listed while empty, and a filled draft is a valid API-003 request only after confirmation.
- `tests/intake/manual/manual-form.test.ts` (9, Node hook harness):
  - The form never calls the server, and an empty form saves a non-`[MOCK]` device draft.
  - It shows the AI pre-fill note, and for `[MOCK]` the "not copied" note.
  - Required fields block "পরের ধাপ" with inline errors; a filled form saves and opens S-003.
  - An attempted submission is not overwritten.
  - Discard asks first.
  - English strings exist.

### Built-app browser journey (`next start` + headless Chrome, throwaway local DB, dropped afterwards)

The run started with **no cookies**:
1. **S-001 → S-002.** Shows the `[MOCK]` label "নমুনা উত্তর, আসল এআই নয়".
2. **"ফর্ম খুলুন" → S-005.** Shows "নমুনা উত্তরের তথ্য ফর্মে নেওয়া হয়নি…".
3. **"পরের ধাপ" while empty** shows the inline summary.
4. **Filled form** (name, age 7, female, red dress, afternoon of 16 Oct, place, `[MOCK]` district 26, relation, phone) **→ S-003.** It offers the real "যাচাই করে জমা দিন" (disabled until "আমি যাচাই করেছি").
5. **Confirm and submit.** The report is saved, the browser receives `__Host-fera_ps` (HttpOnly, minted by API-003 per OD-022-5), and the success screen links to `/report/<id>`.
6. **S-004.** Shows "M-0X6X4D", the status "খোলা" and "মিল খোঁজা হবে". The GD draft loads; the poster with the phone omitted downloads as `fera-poster-M-0X6X4D-draft.png` and shows the parent's entries and 13219; the 13219 summary loads.

Before this task the same journey stopped at S-003, because the `[MOCK]` intake disables submit by design.

## Not done
- **Automatic S-002 → S-005 hand-off on AI failure.** This is the TC-017 "form opens ≤ 2 s after error" part. It is S-002 behaviour, so the owner (Obidit) decides; OD-025-1.
- **District as a searchable select with Bangla and English names (D3 SCREEN-005).** It waits on TASK-009 (Masnun); until then, the `[MOCK]` number 1–64 (OD-022-14).
- **Playwright journey and axe** (TASK-038); no screen-reader walk.
- **Human Bangla review** of the new strings.

## Open decisions
- **OD-025-1 Automatic hand-off on AI failure (TC-017).** S-002 reaches the "manual" phase after the follow-up rounds and on E-012, E-013, E-023 or a second E-014, but only shows a link. Should it navigate to S-005 by itself? Owners: Obidit (S-002) and Mahim.
- **OD-025-2 S-005 reuses the S-003 field set.** S-005 shows the same fields and S-003 shows them again for confirmation (review-before-submit). This is one shared component, not a second form to keep in step.
