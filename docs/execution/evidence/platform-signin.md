# TASK-031 evidence — SCREEN-008 sign-in and SCREEN-016 not found / not allowed

Owner: Mahim · Lane: `mahim-signin` (Claude Code), branch `phase2--mahim-signin` from `origin/phase2` · Date: 2026-10-15 (Asia/Dhaka) · Links: TASK-031, COMP-047, COMP-045, FR-037, FR-020, BR-007/010/024, TC-022, D3 SCREEN-008, SCREEN-016, §1, §6 and §7 row 9, D4 §12–§14, D2B §13 (E-002, E-004, E-007, E-021).

All accounts and data are synthetic. Nothing was deployed and no hosted database was touched.

## Status against "Done when TC-022 passes"

**TC-022 does not pass yet, and this lane cannot make it pass.** D6 TC-022 is an API check: parent and staff sessions request API-009 and API-004 for another case and must get a 404 body with E-004 and an `access.denied` audit row. Neither route exists in this branch (`src/app/api/` has only `auth/sign-in`, `auth/sign-out` and `health`), and the audit writer is TASK-015's. What TASK-031 contributes to TC-022 is the screen side:

- SCREEN-016 is the App Router not-found, so any `notFound()` (requireRole's wrong-role denial, a hidden record) renders it with HTTP 404.
- One screen for E-003 and E-004, with no input that could tell them apart.

The TC-022 browser steps (Playwright) are pending TASK-038. Playwright is not installed and was not added.

## What was built

| Area | Files | Notes |
|---|---|---|
| SCREEN-008 page | `src/app/(auth)/sign-in/page.tsx` | Server component on the desk surface (Cockpit). Reads `?next`, keeps it only if `safeReturnPath` accepts it (single value; arrays are dropped). The title names the role from the area being entered (D4 §14): `/officer…` → "কর্মকর্তা সাইন ইন" / Officer sign-in, `/staff…`, `/admin…`; otherwise "সাইন ইন" / Sign in. An info note appears only when a deeper page will be reopened. The demo hint is decided here from `DEMO_MODE=1`. |
| COMP-047 form | `src/app/(auth)/sign-in/sign-in-form.tsx` | Client form posting JSON to API-020. `autocomplete="username"` / `"current-password"`, `autocapitalize="none"`, spellcheck off. A separate show/hide button (`aria-controls`, name "পাসওয়ার্ড দেখান" / Show password, visible word inside the name). Labels via `for`/`id`; required-field errors and the credentials error are linked with `aria-describedby` and set `aria-invalid`. One always-mounted `role="alert"` region, emptied on every attempt so a repeated error is announced again; a polite live region announces "সাইন ইন হচ্ছে…" / Signing in…. The submit uses `aria-disabled` while busy (focus stays on it; double presses are ignored), with a spinner. Every control has `min-h-11` (44 px). `method="post"` + `noValidate`: without JavaScript the password never lands in a URL. On success: a full navigation to the destination, so server components re-read the new cookie. |
| Destinations | `src/lib/auth-paths.ts` | Pure, shared by the form and the page guards. `safeReturnPath`, `signInPath`, `roleHome` moved here unchanged from `src/server/auth/require-role.ts`, which re-exports them (same function objects; existing tests unchanged). New: `homeForSession` (unverified officer → `/staff`, BR-024), `returnTarget`, `destinationAfterSignIn`, `signInAudience`, `parseSignedInSession`. Rule: an unsafe `next`, `/`, `/sign-in` or a desk entry root (`/staff`, `/officer`, `/admin`) leads to the role home; any other safe path is reopened (D3 §6, expiry → same URL). A path the role cannot open gets SCREEN-016 from the page guard, so there is no redirect loop. |
| Error copy | `src/lib/sign-in-errors.ts` | Any 401/E-002 → the exact D3 copy "ইউজারনেম বা পাসওয়ার্ড ঠিক নয়" / "Username or password is incorrect"; it never names a field. Any 429/E-007 → "{s} সেকেন্ড পরে আবার চেষ্টা করুন।" / "Please try again in {s} seconds." with whole seconds from `Retry-After` (1–3600), Bangla numerals in Bangla mode; without a usable header, "একটু পরে আবার চেষ্টা করুন।" / "Please try again in a little while.". Anything else (E-003 cross-site, E-021, non-JSON, network failure) → the E-021 catalogue copy. Text from the response is never shown. |
| Demo hint | `src/server/auth/demo-accounts.ts` | Only when `DEMO_MODE` is exactly `1`. One username per role from `scripts/db/seed-users.mjs` (`staff.demo`, `officer.demo`, `officer.pending`, `admin.demo` or a valid `SEED_ADMIN_USER`). **Usernames only:** outside plain local dev the seed requires passwords chosen on the day, so none is documented as demo-safe. Shown in a dashed `[MOCK]` box that says so: "নামে চাপ দিলে ইউজারনেম বসবে" / "Tap a name to fill the username". Each row is a button with a trailing return-arrow cue; it fills the username and moves focus to the password. |
| SCREEN-016 | `src/app/not-found.tsx`, `src/app/components/not-found-screen.tsx`, `src/app/components/focus-heading.tsx`, `src/lib/not-found.ts` | Root not-found for every route (desk routes included): unknown URLs and every `notFound()`, including `requireRole`'s wrong-role denial after its `access.denied` hook. Copy "তথ্যটি পাওয়া যায়নি।" / "We couldn't find that." (D3, equal to the E-004 catalogue message), one hint sentence, one home link. The heading receives focus on mount (`tabIndex=-1`, not a tab stop). The component takes no error ID or record. The only input is the viewer: desk roles get the Cockpit surface and their D3 home; signed-out visitors and parents get the Paper surface and `/`. A failed session lookup falls back to the signed-out view, never a 500. Neutral tones only (no danger tokens). `showsNotFoundScreen()` routes both E-003 and E-004 to this screen for future desk clients. |
| Sign-out | `src/app/components/sign-out-button.tsx` | ACT-029 control calling API-020 sign-out, then loading `/sign-in`; generic error on failure. **Not mounted:** no desk shell exists yet (S-007/S-009/S-013 belong to other owners). |
| Icons | `src/app/components/icons.tsx` | Inlined Lucide outline icons (ISC, `third_party/lucide.LICENSE`), `aria-hidden`. |
| Strings | `src/locales/index.ts` | 34 new keys, each in Bangla and English. D3/D4/D2B strings are used verbatim where they exist (see Open decisions for the new ones). |

Finish review (`impeccable-finish-reviewer`, fresh context): disposition **fix** with two material items. (1) Recapture the missing E-007 and desk S-016 states: E-007 was recaptured as above; desk S-016 remains unevidenced in a browser (DB down). (2) The demo rows' fill action was announced only to screen readers: fixed with visible note copy and a trailing cue, plus a focus-visible background. Its "keep" list (generic E-002, reason-blind S-016, usernames-only `[MOCK]` block) is unchanged. Unused Cockpit devices it noted, not taken: a ⏎ keycap in the submit, an elevated card for the form, and a line illustration for S-016 (OD-031-3). No verdict re-review was run.

Design: `impeccable` (shape, then build) in the established Cockpit & Paper world, Operate mode. No direction tournament (an extension inside an established world). No human was available to answer the shape questions, so the brief's assumptions are listed under Open decisions. `impeccable detect --json` on the five UI files returned `[]`.

## Verification (2026-10-15, local)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 803 passed, 79 skipped (the DB suites), 36 files; 101 of them new in this lane (below) |
| `npm run build` | 0 | routes `/`, `/_not-found`, `/sign-in`, `/api/auth/sign-in`, `/api/auth/sign-out`, `/api/health` (all dynamic); `.next` removed afterwards |
| `npm run test:db` | not run to completion | **Blocked:** the local Postgres at `127.0.0.1:54322` stopped answering during the smoke run (see below), so `test:db` failed at its `db:reset` step with `psql: … timeout expired`. Server code touched here: `require-role.ts` (re-export only, no behaviour change) and the new `demo-accounts.ts` (no DB use). The guard suites already cover `require-role` in `npm test`. Re-run `npm run test:db` once the DB answers. |

New tests:
- `tests/auth/auth-paths.test.ts` (23): role → home for every session shape, checked against the contracts' `effectiveRole`; an unverified officer entering at `/officer` lands on `/staff`; entry roots, `/` and `/sign-in` give the role home; a deep path is reopened; nine unsafe `next` values (absolute URL, `//host`, backslash, dot segments, `%2e`, `javascript:`, control character, over-long) give the role home; title audience; API-020 body parsing; the page guards re-export the same functions.
- `tests/auth/sign-in-errors.test.ts` (12): exact E-002 copy in both languages and the same text for every 401 body; E-007 with `Retry-After: 42` → "৪২ সেকেন্ড পরে আবার চেষ্টা করুন।" (no Latin digits) and "Please try again in 42 seconds."; the server's own E-007 envelope and header round-trip to its `message_bn`/`message_en`; seven unusable headers → the wait-a-little copy; E-003, E-021, 502 and unknown IDs → generic; response text never shown.
- `tests/auth/demo-accounts.test.ts` (4): off unless `DEMO_MODE` is exactly `1`; every shown username is seeded with the same role and verification; `SEED_ADMIN_USER` followed like the seed, invalid ones ignored; no password field and none of the committed local passwords in the output.
- `tests/ui/sign-in-screen.test.ts` (11, server render in Node): labels, autocomplete, password type, POST + noValidate, toggle is a non-submitting button with the right names, one submit, alert region, no `disabled`, 44 px on every control, demo hint absent without accounts and present (dashed, `[MOCK]`, usernames, no passwords) with them; page on the desk surface, role-named titles in both languages, return note only for deep paths (not for unsafe or array `next`), demo hint only with `DEMO_MODE=1`.
- `tests/ui/not-found-screen.test.ts` (14): D3 copy equals the E-004 catalogue message; one h1 with `tabindex="-1"` and one home link with 44 px; no danger or signal classes; E-003 and E-004 (and only those) route to SCREEN-016 and render byte-identical markup in both languages for every viewer, although their API envelopes differ; a real `requireRole` wrong-role denial calls the audit hook and the not-found output equals the plain unknown-URL output; root not-found through the real resolver: signed out → Paper and `/`, staff → `/staff`, verified officer → `/officer`, unverified officer → `/staff`, admin → `/admin`, garbage cookie → signed out, failed lookup → signed out; follows the language cookie.
- `tests/locales.test.ts` (+37, now 42): every new key in both languages; exact D3/D4 strings; reused catalogue messages equal D2B §13 (E-004, E-007, E-021); the toggle's visible word sits inside its accessible name (WCAG 2.5.3).

### Built-app smoke (`next start`, headless Chrome over CDP)

Run against a throwaway local database `fera_signin_smoke` (`FERA_DB_NAME=fera_signin_smoke npm run db:reset`, then `npm run seed:users` with a random throwaway password), `DEMO_MODE=1`, random `AUTH_SECRET`/`PARENT_COOKIE_KEY` in the process environment. Screenshots were kept outside the repo (session scratchpad), not committed.

Observed:
- S-008 renders at 1280 px and 360 px in Bangla and English, Cockpit surface, with the `[MOCK]` demo hint; the English page with `?next=/officer/case/abc` shows "Officer sign-in" and the return note.
- An empty submit shows both field errors and focuses the username.
- An unknown username gives "Username or password is incorrect" in the alert region (desktop and mobile; API log: 2 × 401 E-002), with both inputs marked invalid and the password cleared.
- `/officer/case/abc` signed out renders S-016 on Paper with the home link `/`, and `document.activeElement` is the `H1` (desktop and mobile).
- `officer.pending` signing in from `?next=/officer` landed on `/staff` (API log: 200), which is a 404 (S-016) until S-007 exists.

Not observed in the browser:
- The local Postgres at `127.0.0.1:54322` stopped completing connections right after that sign-in (TCP open; the startup handshake timed out at 5–20 s, also for the owner connection), so the next sign-ins answered E-021 after 5 s. The S-016 shot after the unverified-officer sign-in therefore shows the signed-out fallback (Paper, `/`), not the desk view. The cause is **UNKNOWN**; host free memory was very low at the time. The Docker CLI was not used (lane rule).
- So the E-007 browser state and a verified officer's return to the same URL were not observed in the browser. Both are covered by the unit tests above.
- Before that, the shared local `fera` database answered `42501` (insufficient privilege) to `fera_app` sign-in lookups; the cause (likely grants older than TASK-062's `roles.sql`) is **UNKNOWN**, and that database was not changed.
- The throwaway database `fera_signin_smoke` (synthetic seed accounts only) could **not be dropped** because the DB never came back during this session. Drop it when it does: `DROP DATABASE fera_signin_smoke;` as the local owner. `test:db` may also have left `fera_test_98466_1`/`_2` (its own drop failed); whether they were created is **UNKNOWN**.

E-007 capture, separately: with the DB down, a second `next start` run answered API-020 inside the browser (CDP `Fetch.fulfillRequest`) with a 429, `Retry-After: 42` and an E-007 envelope. At 1280 px and 360 px the form showed "৪২ সেকেন্ড পরে আবার চেষ্টা করুন।" with the clock icon on the warning tone, inputs not marked invalid. In the same run a demo row filled `officer.demo` and moved focus to the password. That checks the client mapping only; the server limiter itself is TASK-006's tested path.

Still not observed in a browser: SCREEN-016 on the desk surface for a signed-in user (it needs a live session lookup). It is covered by the root not-found render tests through the real resolver with a stubbed store.

## Not done

- TC-022 itself (API-004/API-009 E-004 + `access.denied` row): needs those routes and TASK-015's audit writer.
- Playwright journeys for S-008/S-016 and the TC-022 browser steps: TASK-038.
- The `/staff`, `/officer`, `/admin` entry → S-008 redirect: it happens when the desk pages call `requireRole`; those pages (S-007, S-009, S-013) are other owners' and do not exist, so today those URLs show S-016.
- The sign-out control is built but not mounted (no desk shell yet).
- No automatic redirect for an already signed-in visitor on `/sign-in`; the form is shown and a new sign-in replaces the session.
- Sign-in without JavaScript: the form posts to `/sign-in`, which does not process it (no password in any URL, but no sign-in either).
- Screen-reader, 200 % zoom and forced-colours walks were not run; only the server-render checks and the screenshots above.

## Open decisions

- **OD-031-1 Role home paths.** D3 §1 names screens, not URLs. This lane keeps TASK-006's `roleHome`: `/staff` (S-007), `/officer` (S-009), `/admin` (S-013). AGENTS.md lists `(desk)/officer/{queue,…}`, so S-009 might live at `/officer/queue`; if so, `/officer` must redirect there or `roleHome` changes (one line, tested). Masnun/Sadman to confirm.
- **OD-031-2 New strings without D3/D4 source** (bengali-reviewer pass wanted): staff/admin titles ("স্টাফ সাইন ইন", "অ্যাডমিন সাইন ইন"; "স্টাফ" follows the seed display names), intro, return note, required-field messages, show/hide words, signing-in/redirecting, the wait-a-little E-007 fallback, demo hint texts and role labels, sign-out busy text, and the S-016 hint and home label.
- **OD-031-3 S-016 illustration.** D4 §14 asks for a line illustration; DESIGN.md's Fera overrides allow illustration only on parent screens, and S-016 is shared. A Lucide `search-x` icon tile is used instead.
- **OD-031-4 Not-found does a session lookup** on every 404 to pick the surface and home link. A failed lookup silently falls back to the signed-out view (no log line); a database outage therefore shows desk users the Paper view with `/`.
- **OD-031-5 E-007 button.** The submit stays enabled during the wait; attempts while limited are refused before any password check and are not counted (TASK-006 limiter).
- **OD-031-6 Demo hint and `SEED_ADMIN_USER`.** The hint shows `SEED_ADMIN_USER` when the app process has a valid one, else `admin.demo`; whether the finale laptop sets it for the app process is **UNKNOWN**.
- Assumptions made without a human answer (impeccable shape): Operate mode; one column ≤ 400 px; demo usernames are clickable to fill the field; the return note shows only for deep paths.
