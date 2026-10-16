# TASK-023 evidence — output templates, wording guard and API-006

Owner: Obidit · Lane: `obidit-templates` (Claude Code), branch `phase2--obidit-templates` from `origin/phase2` at `0617b4c` · Date: 2026-10-15 (Asia/Dhaka) · Links: TASK-023, COMP-010, COMP-016, API-006, FR-008, FR-009, FR-034, BR-002, BR-003, BR-011, BR-022, BR-025, TC-005, TC-024, D3 SCREEN-004, D4 §10 and §15.1.

All data is synthetic. Nothing was deployed and no hosted database was touched.

## Status against "Done when TC-005 and TC-024 pass"

- **TC-005 passes at service level.** A GD for a submitted report contains name, age, last-seen place, date-time and reporter phone, and carries "খসড়া". Every line that differs from a render with every field unknown is a labelled case field, so the text adds nothing beyond template text and case fields. Evidence: `tests/outputs/templates.test.ts` ("GD draft (TC-005, FR-008)"), and on PostgreSQL 16 `tests/db/outputs.test.ts`.
- **TC-024 passes at service level.** A GD template with "পালিয়ে গেছে" injected (`vi.spyOn`) gives E-016. Nothing is inserted, the transaction rolls back, and the error carries no text (`tests/outputs/service.test.ts`, "TC-024").
- **Not tested here:** the TC-005 step "Tap জিডি খসড়া" needs S-004 (Mahim's TASK-024). The route itself has no HTTP-level test; `defineRoute` wiring is covered by the API layer's own tests (`tests/api/platform.test.ts`).

## What was built

| Area | Files | Notes |
|---|---|---|
| Templates (COMP-010) | `src/server/outputs/templates.ts` | GD and poster, fixed Bangla, Bangla numerals, Dhaka time formatted without ICU (cached text must not change between Node versions). A missing field prints "অজানা". `source_text` and `circumstances` are never copied. The draft label "খসড়া — নিজে জমা দিন · সিনথেটিক তথ্য" (D3 S-004) heads both. The GD carries "ফেরা পুলিশে জিডি জমা দেয় না।"; the poster carries "জরুরি হলে ১৩২১৯-এ কল করুন।" and the reporter phone. The district comes from the reviewed code (`districts.name_bn`), then the parent's district words, then "অজানা". |
| Wording guard (COMP-016) | `src/server/outputs/guard.ts` | 7 groups (alert, runaway, rescue, returned, delivered, probability, legal), each with Bangla and English terms and the common spelling variants. Matching runs after NFC, invisible-joiner removal, whitespace collapse and lower-casing. A hit is E-016; neither the text nor the term is logged. |
| Service | `src/server/outputs/index.ts` | `getOutput(principal, caseId, type, ctx)`: `readCase` (ownership, owner projection) → E-004 when hidden. When the owner view has no draft (locked or redacted), E-016 without reading the cache (BR-025). Then one transaction: `SELECT … FROM cases … FOR SHARE` re-checks version, `anonymised_at IS NULL` and an editable status, which serialises with `redact_case` and owner edits. Then the cache read per (case, type, version), or render → guard → `INSERT … ON CONFLICT DO NOTHING RETURNING` → re-select on conflict. The guard runs again before serving. |
| Route API-006 | `src/app/api/cases/[id]/outputs/route.ts` | `defineRoute({ api: "API-006" })`, parent only, record route (E-004 + `access.denied` written by the layer). The body is the contract `outputRequestSchema`; `helpline` was E-001 until TASK-047 (branch `phase2--obidit-helpline`) added its template. |
| Tests | `tests/outputs/{guard,templates,service}.test.ts`, `tests/db/outputs.test.ts`; `scripts/db/test-db.mjs` runs the new DB file | The guard test also scans every `src/locales` string and the error catalogue (0 hits). |

## Verification (2026-10-15, local, after fera-review round 1 fixes and the round-2 race test)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | no findings |
| `npm run typecheck` | 0 | |
| `npm test` | 0 | 1009 passed, 121 skipped (DB suites); 75 in `tests/outputs/` |
| `npm run test:db` | 0 | 121/121 (platform 48, redaction 18, auth 13, case 38, outputs 4) on local PG 16 + pgvector 0.8.1. The outputs race test fails when the `version = $2` re-check is removed (checked once, then restored). |
| `npm run build` | 0 | route `/api/cases/[id]/outputs` listed |

## fera-review round 1

Reviewers: fera-safeguarding-reviewer, typescript-reviewer, react-reviewer, database-reviewer, security-reviewer, bengali-reviewer.

- **BLOCK, fixed (fera-safeguarding-reviewer):** `contract-notes.md` cited this file before it existed and described the earlier no-draft behaviour. This file now exists, OD-023-2 and OD-023-5 describe the current code, and the CN-09 acknowledgement is marked as pending Obidit's confirmation.
- **BLOCK, fixed:** an output could be inserted after `redact_case` had deleted the case's outputs, so child text would survive redaction. Found in self-review and by database-reviewer. Fix: the `FOR SHARE` re-check above.
- **WARN, fixed:** a locked report could serve cached payload text that its owner view hides (security); missing Bangla spelling variants (এ্যালার্ট, পালায়, রেসকিউ, দেয়া forms, ran<ZWSP>away); invisible characters written literally in source; range bounds compared as strings; the shared `TEMPLATES` object mutated in a test; template wording ("শেষবার দেখা গিয়েছিল", "বিনীত নিবেদন এই যে", "নিখোঁজ শিশু" heading, inline thana, reporter's name/signature/date line); no test for the 3000-character limit or a malformed ID on the real `readCase`; "amber" matching "Chamber".
- **WARN, kept and recorded:** no CID-integration or identity-confirmation terms in the guard (templates contain none; a bare "সিআইডি" would block D4's required "Fera does not alert police or CID" line); request bodies strip unknown keys (project convention, API-OD-3); no per-principal rate limit (OD-023-4); the guard covers quoted field values (OD-023-5); E-016 copy for locked reports (OD-023-2).

## What is NOT done

- S-004 screen, poster PNG, share acknowledgement and the contact choice: Mahim's TASK-024 (see OD-023-1).
- Helpline summary (FR-010, TC-007): TASK-047.
- Human Bangla review of the template wording, and any check that a thana accepts this GD format (D7 OQ-016).
- The race test stands in for `redact_case` with an uncommitted version bump; `redact_case` itself is not raced (it needs a closed report).
- No Playwright journey; TC-025 ("0 alert actions in UI") needs the screens.

## Open decisions

OD-023-1 to OD-023-6 in `specs/001-platform-foundation/contract-notes.md` ("Output open decisions (TASK-023)"), plus the CN-09 (outputs) acknowledgement.

## fera-review round 2 (on the fixes)

Reviewers: fera-safeguarding-reviewer (PASS; reran `npm test` and `npm run test:db`, outputs 4/4), database-reviewer (round-1 BLOCK resolved, no new BLOCK). Its WARN about a missing race test is answered by the two-session test above. Noted for the TASK-006 owner: in one safeguarding run, `tests/auth/sign-in.test.ts` "unknown user and wrong password take about the same time" failed (ratio 2.43 < 2) while a DB run overlapped, and passed on rerun. It is outside this diff and looks load-dependent.

## Wording-guard hardening (cross-tool reviews)

| Round | Reviewer | Bypass found | Fix (commit) |
|---|---|---|---|
| 1 | Codex gpt-6.1-sol | A reviewed marks value such as "পলায়নকারী শিশু" or "run-away child" passed the wording guard and would be rendered on the poster | Ban the পলায়ন stem and read hyphens and dashes as spaces before matching (`0dc1d55`) |
| 2 | Codex gpt-6.1-sol | "run/away", "r u n a w a y", fullwidth "ＲＵＮＡＷＡＹ", "পলা-য়ন" and default-ignorable characters (U+034F, U+2063) split banned terms | Compare on NFKC text with default-ignorables removed, lower-cased, letters/marks/digits only; symbol-only terms ("%") use the NFKC text (`3d72a9c`) |
| 3 | Codex gpt-6.1-sol | "পে-ৗঁছে" (a split ৌ) and "run̲away" (decorative combining marks) passed the guard | NFKC again after the removals so split Bangla vowel signs recompose, and drop combining marks outside the Bengali block (`0fac4b0`) |
| 4 | Codex gpt-6.1-sol | "rúnaway child" passed because NFKC composed the accent before decorative marks were stripped | Build the skeleton from NFKD, strip default-ignorables and non-Bengali marks, then recompose with NFKC (`6380464`) |
| 5 | Haiku verification | "ফেরৎ দেওয়া" (khanda-ta spelling of ফেরত) passed the returned group | Fold ৎ→ত, dotless ı→i and small-capital ɴ→n in the skeleton; add Arabic percent "٪"; match "deliver" (catches "delivery") (`49b5601`) |

- Known limits (documented in guard.ts): cross-script homoglyphs; inserted Bangla marks such as candrabindu or hasanta inside a word.
- Every round adds regression tests in tests/outputs/guard.test.ts and keeps the locale and error-catalogue false-positive scan green.
