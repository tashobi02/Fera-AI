# TASK-031 evidence — SCREEN-008 sign-in and SCREEN-016 not found / not allowed

Owner: Mahim · Lane: `mahim-signin` (Claude Code), branch `phase2--mahim-signin` from `origin/phase2` (merged again with `origin/phase2` after PR #11, TASK-015) · Date: 2026-10-15 (Asia/Dhaka) · Links: TASK-031, COMP-047, COMP-045, FR-037, FR-020, BR-007/010/024, TC-022, D3 SCREEN-008, SCREEN-016, §1, §6 and §7 row 9, D4 §6, §12–§14, D2B §13 (E-002, E-004, E-007, E-021).

All accounts and data are synthetic. Nothing was deployed and no hosted database was touched.

## Status against "Done when TC-022 passes"

**TC-022 does not pass yet, and this lane cannot make it pass.** D6 TC-022 is an API check: parent and staff sessions request API-009 and API-004 for another case and must get a 404 body with E-004 and an `access.denied` audit row. Neither route exists in this branch (`src/app/api/` has only `auth/sign-in`, `auth/sign-out` and `health`). What TASK-031 contributes is the screen side:

- SCREEN-016 is the App Router not-found, so any `notFound()` renders it with HTTP 404.
- After the merge of TASK-015 (PR #11), `requireRole`'s default page-denial hook is the real `access.denied` writer (`src/server/audit/denied.ts`). A wrong-role page visit writes one audit row and then shows SCREEN-016 with a 404, not a 500. Tested here with the default hook on a recording pool (`tests/ui/not-found-screen.test.ts`), and in TASK-015's `tests/case/hooks-default.test.ts` and `tests/db/case.test.ts`.
- One screen for E-003 and E-004, with no input that could tell them apart.

The TC-022 browser steps (Playwright) are pending TASK-038. Playwright is not installed and was not added.

## What was built

| Area | Files | Notes |
|---|---|---|
| SCREEN-008 page | `src/app/(auth)/sign-in/page.tsx` | Server component on the desk surface (Cockpit). Reads `?next`, keeps it only if `safeReturnPath` accepts it (single value; arrays are dropped). The title names the role from the area being entered (D4 §14): `/officer…` → "কর্মকর্তা সাইন ইন" / Officer sign-in, `/staff…`, `/admin…`; otherwise "সাইন ইন" / Sign in. An info note appears when `next` names a deeper page; it says the page reopens only if the role can open it (OD-031-7 sends other roles to their home). The demo hint is decided here. |
| COMP-047 form | `src/app/(auth)/sign-in/sign-in-form.tsx` | Client form. Uncontrolled inputs read with `FormData` at submit (autofill-safe). `autocomplete="username"` / `"current-password"`, `autocapitalize="none"`, spellcheck off. A separate show/hide button (`aria-controls`, name "পাসওয়ার্ড দেখান" / Show password, visible word inside the name). Labels via `for`/`id`; required-field errors and the credentials error are linked with `aria-describedby` and set `aria-invalid`; a field's error and `aria-invalid` clear as soon as it has a value. One always-mounted `role="alert"` region, emptied on every attempt; a polite region announces "সাইন ইন হচ্ছে…" / Signing in… and a demo fill ("ইউজারনেম বসানো হয়েছে: staff.demo" / "Username set to staff.demo"). The submit uses `aria-disabled` while busy plus a synchronous in-flight guard. After E-002 the password is cleared and focused. Success uses `location.replace`; a back/forward-cache restore (`pageshow` with `persisted`) resets the busy state. Input and toggle borders use the `border-control` token (≥ 3:1). The password row wraps (`flex-wrap`, input `min-w-[min(10rem,100%)] flex-1`), padding is in px at narrow widths, and long usernames break, so 320 px with a 200 % root font has no horizontal scroll. Every control has `min-h-11` (44 px). `method="post"` + `noValidate`: without JavaScript the password never lands in a URL. |
| Submit state machine | `src/lib/sign-in-flow.ts` | Pure: `validateSignIn`, `valuesFromFormData`, `requestSignIn` (one API-020 call with `AbortSignal.timeout(15000)`; abort, timeout, network failure and non-JSON bodies give the generic failure), `signInReducer`, `clearsPassword`, `focusAfter`, `createInFlightGuard`. |
| Destinations | `src/lib/auth-paths.ts` | Pure, shared by the form and the page guards. `safeReturnPath`, `signInPath`, `roleHome` moved here unchanged from `src/server/auth/require-role.ts`, which re-exports them (same function objects). New: `homeForSession` (unverified officer → `/staff`, BR-024), `returnTarget`, `destinationAfterSignIn`, `signInAudience`, `parseSignedInSession`. Rule: an unsafe `next`, `/`, `/sign-in`, a desk entry root (`/staff`, `/officer`, `/admin`), or anything under `/api` or `/_next` leads to the role home. Any other safe path is reopened (D3 §6, expiry → same URL) **only when its first segment matches the role home's** (OD-031-7); otherwise the role home. |
| Error copy | `src/lib/sign-in-errors.ts` | Any 401/E-002 → the exact D3 copy "ইউজারনেম বা পাসওয়ার্ড ঠিক নয়" / "Username or password is incorrect"; it never names a field. Any 429/E-007 → "{s} সেকেন্ড পরে আবার চেষ্টা করুন।" / "Please try again in {s} seconds." with whole seconds from `Retry-After` (1–3600), Bangla numerals in Bangla mode; without a usable header, "একটু পরে আবার চেষ্টা করুন।" / "Please try again in a little while.". Anything else → the E-021 catalogue copy. Text from the response is never shown. |
| Demo hint | `src/server/auth/demo-accounts.ts`, types in `src/lib/demo-accounts.ts` | Only when `DEMO_MODE` is exactly `1` **and** `VERCEL` is unset. Usernames from `scripts/db/seed-users.mjs`: `staff.demo`, `officer.demo`, `officer.pending` and the fixed `admin.demo`. A configured `SEED_ADMIN_USER` is never shown; when it renames the admin, the admin row is left out. **Usernames only**: no password is documented as demo-safe. A dashed `[MOCK]` box (`lang="en" translate="no"`) whose note says a tap fills the username; each row is a button with a trailing cue and a focus-visible background. |
| SCREEN-016 | `src/app/not-found.tsx`, `src/app/components/not-found-screen.tsx`, `src/app/components/focus-heading.tsx`, `src/lib/not-found.ts` | Root not-found for every route. Copy "তথ্যটি পাওয়া যায়নি।" / "We couldn't find that." (D3, equal to the E-004 catalogue message) as the one sentence (heading), one home link (COMP-045: one sentence + one action; the earlier hint was dropped). The heading receives focus on mount. The tab title is the localised `notFoundTitle` (SC 2.4.2). The component's only inputs are `locale` and `view`; the view comes from the viewer only (desk roles: Cockpit and their D3 home; signed-out and parents: Paper and `/`). A failed session lookup falls back to the signed-out view and logs `page.viewer_lookup_failed` with error class and code only (no cookie, path or principal); Next's own control-flow errors are rethrown. Neutral tones; home link hover uses the pressed action token. `showsNotFoundScreen()` routes E-003 and E-004 to this screen for desk clients. |
| Tokens | `src/app/globals.css` | New `--border-control` (Paper `#6F7D77`, Cockpit `#82938B`, from D4 §6 `--color-border`) and `--border-control-strong` (Paper `#4B5752`, Cockpit `#B3C0BA`) for hover/focus, exposed as `border-control` / `border-control-strong`. The file header records that D4 §6/§13 win over DESIGN.md's hairline for inputs. Hairlines stay for cards and dividers. |
| Frame protection | `next.config.ts` | `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` on every route. Seen on `/sign-in` with `curl -I` against `next start`; build and fonts unaffected. |
| Lint boundary | `eslint.config.mjs` | New block for client paths (`src/components/**`, `src/app/components/**`, `src/app/**/*-form.tsx`, `src/hooks/**`) and all of `src/lib/**`: no import of `@/server/**`. Checked: it fires on `src/lib/x.ts`, a `*-form.tsx` and `src/app/components/x.tsx`, and not on a server `page.tsx`. Other `"use client"` files elsewhere under `src/app` are not covered (not expressible by path). |
| Sign-out | `src/app/components/sign-out-button.tsx` | ACT-029 control; **not mounted** (no desk shell yet). |
| Logger | `src/app/api/_shared/log.ts` | One new event name, `page.viewer_lookup_failed`. |
| Strings | `src/locales/index.ts` | 34 keys added for this task, each in Bangla and English (`notFoundHint` removed, `demoFilled` added). "স্টাফ" for the staff role throughout, including `homePlaceholder` ("অভিভাবক, স্টাফ ও কর্মকর্তার স্ক্রিন পরের কাজগুলোতে যুক্ত হবে।"). Bangla 13 px captions (field errors, demo note, role labels) render at 14 px under `lang="bn"`; Bangla headings are semibold, English bold. |

Design: `impeccable` (shape, then build) in the established Cockpit & Paper world, Operate mode. No human answered the shape questions; the assumptions are listed under Open decisions. `impeccable detect --json` on the UI files returned `[]`. Finish review (`impeccable-finish-reviewer`) returned **fix**; both items were handled (see the review table).

## Verification (2026-10-15, local, after fera-review round 1)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` (run twice) | 0 | 932 passed, 117 skipped (the DB suites), 44 files; same result both runs |
| `npm run test:db` | 0 | 117/117 on the restarted local DB: platform 48, redaction 18, auth 13, case 38 |
| `npm run build` | 0 | routes `/`, `/_not-found`, `/sign-in`, `/api/auth/sign-in`, `/api/auth/sign-out`, `/api/health` (all dynamic); `.next` removed afterwards |

Tests owned by this lane (160):
- `tests/auth/auth-paths.test.ts` (25): role → home for every session shape, checked against the contracts' `effectiveRole`; the D3 §1 journey (unverified officer at `/officer` → `/staff`); entry roots, `/` and `/sign-in` give the role home; deep paths reopened only inside the role's own area (unverified officer on `/officer/case/…` → `/staff`; admin on `/officer/map` → `/admin`); `/api…` and `/_next…` never reopened (`/apiary` is); nine unsafe `next` values; title audience; API-020 body parsing; the guards re-export the same functions.
- `tests/auth/sign-in-flow.test.ts` (21): validation (password never trimmed), FormData reading, the request shape (JSON, same-origin, no-store, abort signal), success destinations, 401/429/500/non-JSON/wrong shape/network outcomes, a 20 ms timeout ending as generic, password clear and focus rules, reducer (required/invalid, in-flight and leaving guards, E-002 marks both fields, per-field clearing on input, a new attempt clears the failure, demo fill, pageshow reset, stray outcomes ignored), in-flight guard.
- `tests/auth/sign-in-errors.test.ts` (12): exact E-002 copy; the same text for every 401 body; E-007 with `Retry-After: 42` in both scripts (no Latin digits in Bangla); the server's own E-007 envelope and header round-trip; unusable headers; generic for the rest; response text never shown.
- `tests/auth/demo-accounts.test.ts` (5): off unless `DEMO_MODE` is exactly `1`; off on Vercel; usernames and roles match the seed; a configured `SEED_ADMIN_USER` never shown (row left out); no passwords.
- `tests/ui/sign-in-screen.test.ts` (15, server render): labels, autocomplete, POST + noValidate, toggle, one submit, alert region, no `disabled`; exactly 8 controls all at 44 px; inputs use `border-control` with stronger hover/focus and no hairline; the password row wraps; Bangla captions at 14 px and `[MOCK]` in English; demo rows without `aria-controls`; demo hint absent/present correctly, including on Vercel; desk surface, role titles, return note rules.
- `tests/ui/not-found-screen.test.ts` (20): D3 copy equals the E-004 message; one sentence and one action; semibold Bangla heading; localised tab title; pressed-token hover; one h1 with `tabindex="-1"` and one 44 px link; no red. **Structural guarantee** (type-level): the screen's props are exactly `{ locale; view }`, `NotFoundView` is `{ surface; home }`, the not-found page takes no props, and `notFoundView` takes the role only. Consequently both IDs render the same markup per viewer. With TASK-015's default writer, a wrong-role visit records one `access.denied` row (`{"error_id":"E-004"}`) and the not-found shows the desk view with `/staff`. The root not-found through the real resolver for signed-out, staff, verified and unverified officers, admin and a garbage cookie. A failed lookup falls back and logs one `page.viewer_lookup_failed` line without cookie, address or path. A real Next redirect error is rethrown, not swallowed. Follows the language cookie.
- `tests/ui/sign-out-button.test.ts` (2): one non-submitting 44 px button with the D4 copy in both languages, decorative icon, empty alert region.
- `tests/locales.test.ts` (+40, now 45): every key in both languages; exact D3/D4 strings; catalogue messages for E-004/E-007/E-021; label-in-name for the toggle; NFC with no zero-width characters or NBSP in Bangla; "স্টাফ", never "কর্মী"; the demo announcement in both languages.
- `tests/token-contrast.test.ts` (+20): `--border-control` and `--border-control-strong` ≥ 3:1 against canvas, surface, elevated, card and deep, in Paper and Cockpit.

### Built-app smoke (`next start`, headless Chrome over CDP)

Run against a throwaway local database `fera_signin_smoke` (`npm run db:reset` and `npm run seed:users` with a random password), with `DEMO_MODE=1` and random keys in the process environment. **`fera_signin_smoke` was dropped afterwards, along with the earlier copy**; only `fera` remains. Screenshots are in the session scratchpad (`…/scratchpad/shots/`), not committed.

Round 1 (after the fixes), 320 px with a 200 % root font, Bangla and English:
- Idle, required-field, E-002 and S-016: horizontal overflow 0 px on all of them. Before the px-padding/min-width fix the sign-in page overflowed by 74 px; that was fixed in the same round.
- Tab titles "সাইন ইন · ফেরা" / "Sign in · Fera" and "তথ্যটি পাওয়া যায়নি। · ফেরা" / "We couldn't find that. · Fera"; the 404 answers HTTP 404.
- Empty submit focuses the username; typing clears `aria-invalid`.
- E-002 shows the D3 copy, empties the password and focuses it.
- S-016 focuses the `H1`.
- Desk S-016 (1280 px, and 360 px): `staff.demo` on `/staff/unknown-page` and `officer.pending` signing in from `?next=/officer` both land on the Cockpit surface with the home link `/staff` (`officer.pending` was redirected to `/staff`).
- `curl -I /sign-in`: `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`.

Round 0 (before review), kept for the record: E-002 and required states at 1280/360 px; E-007 rendered with "৪২ সেকেন্ড পরে আবার চেষ্টা করুন।", clock icon and warning tone, from an API-020 answer faked in the browser (CDP `Fetch.fulfillRequest`, 429 with `Retry-After: 42`), because the DB was down then. The round-0 desktop captures were deleted by a cleanup glob during round 1; the mobile ones remain. The local Postgres stopped answering during round 0; the coordinator restarted Docker and rebuilt `fera`.

## Reviews

| Review | Finding | Disposition |
|---|---|---|
| impeccable finish review | Missing E-007 and desk S-016 evidence | E-007 captured in round 0, desk S-016 in round 1 |
| impeccable finish review | Demo click-to-fill not visible | Note copy and trailing cue (`dd57eac`) |
| fera-review a11y **BLOCK** B1 (SC 1.4.11) | Input borders ~1.3:1 / ~1.25:1 | `--border-control` from D4 §6, ≥ 3:1 at rest and hover/focus, tested on 5 surfaces × 2 themes |
| fera-review react W1–W3, W8; a11y W1, W3, W4, W6 | Timeout, replace, bfcache, focus, error clearing, reflow, announcement, FormData, `aria-controls` | All done; logic moved to `src/lib/sign-in-flow.ts` with tests |
| fera-review S-016 | Title, silent fallback, hover contrast | `generateMetadata`, `page.viewer_lookup_failed`, `hover:bg-primary-pressed` |
| fera-review security W1, W2, W4, W5, W6 | Vercel gate, admin name, types in lib + lint, framing, `/api` and `/_next` returns | All done; regex escape ` ` restored, so "moved unchanged" is literally true |
| fera-review bengali | স্টাফ, captions, `[MOCK]` lang, note copy, semibold, NFC test | All done. `notFoundHint` **dropped** (COMP-045 one sentence) rather than reworded |
| fera-review tests | Tautological E-003/E-004, vacuous loop, reducer, SignOutButton, rethrow | Structural type test, counted loop, reducer suite, markup test, real redirect error |

Safeguarding, security, react/TS and Bengali reviews were PASS at `9a99610`. No re-review has run on the round-1 fixes yet.

## Not done

- TC-022 itself (API-004/API-009 E-004 + `access.denied` row): needs those routes.
- Playwright journeys for S-008/S-016 and the TC-022 browser steps: TASK-038.
- The `/staff`, `/officer`, `/admin` entry → S-008 redirect happens when the desk pages call `requireRole`; those pages (S-007, S-009, S-013) belong to other owners and do not exist, so today those URLs show S-016.
- The sign-out control is built but not mounted.
- No automatic redirect for an already signed-in visitor on `/sign-in`; the form is shown and a new sign-in replaces the session.
- Sign-in without JavaScript: the form posts to `/sign-in`, which does not process it (no password in any URL, but no sign-in either).
- E-007 shows a static wait, with no live countdown (OD-031-5).
- No screen-reader or forced-colours walk; only server-render tests and the screenshots above.
- `metaDescription` (bn) was not changed; the Bengali review's suggestion needs Mahim's approval (open item).

## Open decisions

- **OD-031-1 Role home paths — closed 2026-10-15 (Mahim):** the officer home is `/officer`. Earlier note: D3 §1 names screens, not URLs. This lane keeps TASK-006's `roleHome`: `/staff` (S-007), `/officer` (S-009), `/admin` (S-013). AGENTS.md lists `(desk)/officer/{queue,…}`, so S-009 might live at `/officer/queue`; then `/officer` must redirect there or `roleHome` changes. Masnun/Sadman to confirm.
- **OD-031-2 Strings without D3/D4 source**, reviewed by the Bengali reviewer at `9a99610` and revised in round 1: staff/admin titles, intro, return note, required-field messages, show/hide words, busy texts, the wait-a-little E-007 fallback, demo texts and role labels, the demo announcement and the S-016 home label.
- **OD-031-3 S-016 illustration.** D4 §14 asks for a line illustration; DESIGN.md's Fera overrides allow illustration only on parent screens, and S-016 is shared. A Lucide `search-x` icon tile is used.
- **OD-031-4 Double session lookup on a wrong-role 404.** `requireRole` resolves the principal, then the not-found page resolves it again for its surface and home link: two user-row reads per denied visit. Not changed.
- **OD-031-5 E-007 has no live countdown.** The submit stays enabled; attempts while limited are refused before any password check and are not counted (TASK-006 limiter).
- **OD-031-6 (closed).** The demo hint no longer reads `SEED_ADMIN_USER`; it shows the fixed `admin.demo` or leaves the admin row out.
- **OD-031-7 Return only where the role may go — updated 2026-10-15:** admins now also return to `/officer/map` and `/officer/case/…` (the S-011/S-012 read pages D3 §1 gives them); everything else outside a role's own area still lands on the role home. Earlier note: `next` is reopened only when its first segment matches the role home's. This avoids S-016 + `access.denied` for a role that cannot open the page (an unverified officer whose session expired on `/officer/…`), but admins lose the return to `/officer/map` and `/officer/case/…` (D3 lets admins read S-011/S-012) and land on `/admin`.
- Assumptions made without a human answer (impeccable shape): Operate mode; one column ≤ 400 px; demo usernames clickable to fill the field; the return note only for deep paths.

## Review round 2 (2026-10-15)

`a11y-architect` re-review of the round-1 fixes: PASS (B1 and W1–W7 fixed; lowest new border contrast 3.96:1, Paper on canvas). `fera-safeguarding-reviewer` re-review: PASS. WARNs fixed in the round-2 commit: the return note now says the page reopens only if the role can open it (OD-031-7); whitespace alone no longer clears the username error; editing the username ends the demo-fill announcement so a repeat fill is read again; the border-token test now requires exactly 2 inputs plus the toggle to carry the base `border-control` class. Still open: OD-031-1 (role home paths), OD-031-7 (admins no longer return to `/officer/...`; needs an owner decision), `metaDescription` wording (Mahim).

## Owner decisions (2026-10-15)

- OD-031-1 closed by Mahim: the officer home stays `/officer`.
- OD-031-7: admins return to `/officer/map` and `/officer/case/…` after sign-in (D3 §1 read access); tests added in `tests/auth/auth-paths.test.ts`.
- `metaDescription` (bn) changed by Mahim's decision to "নিখোঁজ ও খুঁজে পাওয়া শিশুর কেস সমন্বয়ের সিনথেটিক তথ্যভিত্তিক প্রোটোটাইপ" (was "পাওয়া-যাওয়া", which reads as "comings and goings").
