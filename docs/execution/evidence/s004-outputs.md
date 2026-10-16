# TASK-024 evidence — SCREEN-004 case submitted and outputs, poster PNG

Owner: Mahim · Lane: `mahim-outputs` (Claude Code), branch `phase2--mahim-outputs` from `origin/phase2` at `90441a5` · Date: 2026-10-16 (Asia/Dhaka) · Links: TASK-024, COMP-030, COMP-031, COMP-033, STORY-006, FR-008, FR-009, FR-010, BR-002, BR-006, BR-010, BR-022, BR-025, TC-006, D3 SCREEN-004, D4 §10/§14/§15.1, D2A API-006, OD-023-1, OD-023-2.

All data is synthetic. Nothing was deployed and no hosted database was touched.

## Status against "Done when TC-006 passes"

**TC-006 passes locally, checked by hand in a browser; there is no automated browser test yet.** Steps: a submitted case → tap "পোস্টার" → choose the contact option → tick the acknowledgement → make the image → download the PNG.
- The text and the PNG both show 13219, and the phone appears when the parent keeps it.
- There is no photo, and no image input exists anywhere.
- The PNG renders Bangla correctly.

Evidence:
- **Built-app smoke (below).** Two 1080 × 1350 PNGs, with and without the phone. Bangla conjuncts and vowel signs are shaped correctly (শিশু, শনাক্তকরণ, টার্মিনাল, সন্ধ্যা) and no boxes replace missing glyphs.
- **Unit and server-render tests:**
  - `tests/outputs/poster.test.ts`: template pin, share text, layout, paint.
  - `tests/ui/report-screen.test.ts`: the screen, plus a static scan for file or camera inputs, `<img>`, image drawing and `getUserMedia` across `src/app/(parent)`, `src/lib/poster.ts` and `src/lib/outputs-client.ts`.
- **Not automated:** the browser part (canvas, fonts, download). A Playwright journey belongs to TASK-038.

## What was built

| Area | Files | Notes |
|---|---|---|
| Route and guard | `src/app/(parent)/report/[id]/page.tsx`, `src/server/auth/require-own-case.ts` | `/report/<id>` (OD-024-1). `requireOwnCase` runs `requireRole(["parent"])` and then `readCase` through the owner projection. Absent, malformed or another parent's report: one `access.denied` row (API-004, E-004; the FK is kept only when the case exists), then SCREEN-016. When that audit fails, the page fails closed. The draft is never sent to the client. |
| Reference card, COMP-033 | `page.tsx`, `src/app/components/status-badge.tsx`, `src/lib/status-labels.ts` | The reference is the focal element (D4 §14 "large mono digits"): JetBrains Mono, clamp(1.75rem, 9vw, 3.5rem), `lang="en"`, never wrapped. The badge is icon + text + colour with the D3 labels খোলা / যাচাই চলছে / বন্ধ. The matching line uses D4 wording ("মিল খোঁজা হবে", "মিল খোঁজা চলছে", "মিল খোঁজা হয়েছে", and the §15.1 failure line, OD-024-5). The header also holds "ফেরা পুলিশে জিডি জমা দেয় না।" and the `tel:13219` link, so the call link stays near the top. |
| COMP-030 output cards | `output-card.tsx`, `ui.tsx`, `use-output.ts`, `copy.ts`, `src/lib/outputs-client.ts` | GD draft, poster and 13219 summary. Each card has a descriptive title and the D3 action label on its (secondary) button, plus the draft label "খসড়া — নিজে জমা দিন". API-006 is called only on tap. Focus moves only on a status change (a language toggle neither moves focus nor re-announces): to the text block when ready, to the failure when it fails, to the card's button on retry. Text goes in a focusable `<pre lang="bn" role="group">` named by its title, with Latin runs (`[MOCK]`, the reference) marked `lang="en"`. Progress, "লেখা তৈরি হয়েছে" and "কপি হয়েছে" share one polite region, re-announced per copy and cleared on a language change. Failures go to an always-mounted alert region. Without the Clipboard API (plain HTTP), the text is selected and the card says "copy it yourself". Errors use catalogue copy on a neutral surface; E-004, E-019 (S-004 copy, OD-024-2) and E-020 have no retry. In English mode the GD and 13219 cards note that the draft text is in Bangla. |
| COMP-031 poster | `poster-share.tsx`, `src/lib/poster.ts`, `src/lib/poster-render.ts` | Preview text, then the D4 §15.1 share notice. The contact radios have no default, and a separate acknowledgement (naming the phone) follows. Pressing "prepare" without them moves focus to the first missing control, with its own message. Declining removes the fixed contact line, and the poster is blocked if a phone number remains in any form: Bangla, Latin or fullwidth digits, with spaces, hyphens, dots, commas, slashes, underscores, brackets or invisible characters between them, or with `880` / `+880` (OD-023-1). Each render is a numbered run (`renderPoster`). Changing the choice, unticking the acknowledgement, a second run or leaving the page makes it stale, so it never publishes. Fonts: `document.fonts.load` for both Bangla weights and the Latin face, with a 5 s timeout; both Bangla loads must return a face, otherwise no image. Body text runs from 40 px down to 24 px under a draft header and footer; an over-wide cluster or text that does not fit is "too long, copy the text". The context type has no image-drawing method. Download: `fera-poster-<ref>-draft.png`. The canvas is `role="img"`, described by the poster text above it. "Prepare" and "download" are the screen's only primary buttons. |
| Locked reports | `page.tsx` | When the report is not editable or the owner view has no draft, the output actions are hidden and a neutral note plus `tel:13219` are shown (OD-023-2). |
| Copy | `src/locales/index.ts` | 45 keys in bn and en. From the spec: status labels, matching lines (D3 S-007 "মিল খোঁজা হয়েছে", D4 §10, §15.1), draft label, ACT-009/010/011 labels, "তৈরি হচ্ছে…", "কপি হয়েছে", the poster share line, the no-filing line, "১৩২১৯-এ কল করুন". Without a source: OD-024-4. Parent-facing poster labels avoid "ছবি" (photo). The outputs guard test scans every locale string and finds no banned term. |
| Icons | `src/app/components/icons.tsx` | Lucide Copy, Download, Phone, CircleDot, GitCompare, FileText, LayoutTemplate, inlined. |

## Verification (2026-10-16, local)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 1323 passed, 142 skipped (the DB suites); after the second round of fixes |
| `npm run build` | 0 | new route `/report/[id]`; `.next` removed afterwards |
| `npm run test:db` | not run | this lane adds no SQL; `requireOwnCase` uses the existing `readCase` |

New tests (97, after both rounds of fixes; 1226 before this task + 97 = 1323):
- `tests/outputs/poster.test.ts` (40; the list below is the first round, extended by the fixes):
  - The API-006 poster has exactly one contact line, and the phone appears only there. This pins Obidit's template for the contact choice.
  - Include leaves the text unchanged; decline drops exactly one line and keeps 13219.
  - Fifteen "number still present" cases (separators, `+880`, fullwidth, zero-width) block the poster; five ordinary numbers (dates, height, age range, reference, 13219) do not.
  - Line roles; wrapping inside the width; grapheme splitting that never breaks a conjunct.
  - Layout fits with 13219, phone, draft label and reference inside the margins; a declined poster has no phone; long text shrinks and very long text is `too-long`.
  - Paint draws white first, then text only; the file name.
- `tests/outputs/outputs-client.test.ts` (22):
  - The request shape (POST, same-origin, no-store, timeout signal).
  - Offline is E-024 with no request; rejection or timeout is E-021; a non-contract body or the wrong type is E-021.
  - HTTP and body mapping: 422 E-016; 429 with a body ID E-020 → E-020, with E-007 → E-007 (Retry-After read from the response); 404 E-004; 401 E-002 → E-019 with S-004 copy; 500/503 E-021. Retry-After is honoured, and E-024 is never taken from a body.
  - Catalogue copy with Bangla numerals; retry and limit rules; the reducer; D3/D4 labels for every status group and matching state; OD-023-2.
- `tests/auth/require-own-case.test.ts` (6, including "the role check runs before any read"): owner view returned; absent and not-owned each write one audit row, then not-found; a non-owner projection is refused; an audit failure throws `PageAuditUnavailableError`.
- `tests/ui/report-screen.test.ts` (29: 7 screen, 1 Latin-run marking, 3 badge, and per source file one no-image scan and one no-red / border check):
  - The guard call, the parent surface, the mono reference, the badge, the matching line, the no-filing line.
  - Three draft labels and three D3 actions, with no draft name or phone in the page.
  - English mode; `tel:13219` at least 44 px; the locked and no-draft states; no `danger` and every button at least 44 px.
  - The badge for each status group.

### Built-app smoke, first round (`next start`, headless Chrome 155 over CDP, at `c407c7f`)

- **Setup:** a throwaway local database `fera_report_smoke` (`db:reset`), with one `[MOCK]` district row, because the district seed (TASK-009) has not landed yet. One parent session and one missing report from the contract example, created through `createMissingCase` as `fera_app`.
- **Secrets:** random `AUTH_SECRET` and `PARENT_COOKIE_KEY`, kept only in the process environment and deleted afterwards.
- **Cleanup:** `fera_report_smoke` was dropped and Docker was stopped. Screenshots and PNGs are in the session scratchpad, not committed.

Results:
- **390 px, Bangla:** title "রিপোর্ট জমা হয়েছে · ফেরা", horizontal overflow 0, every button 44 px.
- **GD card:** the text appears in `<pre lang="bn">` and starts with the draft header.
- **Poster:**
  - "Make image" before choosing shows "আগে নম্বরের বিষয়টি বেছে নিন…" in the alert region and moves focus to the first radio.
  - With "omit" and the box ticked, a 1080 × 1350 PNG is made and "পোস্টারের ছবি তৈরি হয়েছে" is announced. The download is `fera-poster-M-ZLQ7ZE-draft.png` (a blob URL).
  - Switching to "include" removes the old download until a new image is made. The second PNG shows the contact line.
  - "Copy poster text" copies to the clipboard and announces "কপি হয়েছে".
- **320 px with a 200 % root font:** overflow 0. **English:** title "Report submitted · Fera", overflow 0.
- **No parent cookie:** `/report/<id>` answers 404 (SCREEN-016).

### fera-review (head `c407c7f`) and fixes (`9c5ee02`, `2424588`)

Reviewers: fera-safeguarding PASS, security PASS, typescript PASS, bengali PASS, react **BLOCK** (1), a11y **BLOCK** (2). The impeccable finish review asked for desktop captures first (recaptured below).

BLOCKs, all fixed:
- **react B1 (also a security WARN): stale render.** While the font or the PNG encoder was pending, the parent could switch to "omit" or untick the acknowledgement and still receive a download made under the old choice. Now every render is a numbered run (`src/lib/poster-render.ts`). A changed choice, an unticked box, a second tap or leaving the page makes the run stale: it publishes nothing and revokes any URL it created. The make button ignores taps while rendering, and every failure becomes a state instead of an unhandled rejection.
- **a11y B1: load results not announced, focus lost.** Focus now moves to the text block when it loads, to the failure (in an always-mounted alert region) when it fails, and to the download link when the poster is ready. "লেখা তৈরি হয়েছে" and "পোস্টার ডাউনলোডের জন্য তৈরি" are announced, and a repeated copy is announced again: the region is cleared, then re-set on the next frame.
- **a11y B2: control borders.** The secondary buttons and the `tel:13219` link use `border-control` (≥ 3:1, D4 §13).

WARNs fixed:
- **Phone guard.** Digits are normalised before testing: Bangla to Latin, NFKC (fullwidth), and spaces, hyphens, dots, brackets and invisible characters between digits removed. It then blocks an 11-digit `01…` mobile, the same with `880` or `+880`, or any run of 10+ digits. Twelve separator cases and five ordinary-number cases are tested.
- **Grapheme handling.** A cluster ending in a hasanta is glued to the next one, so engines older than Unicode 15.1 cannot split ক্ষ. One cluster wider than the page, or a non-numeric measure, makes the layout too long.
- **Draft footer.** The PNG now carries a draft footer (D4), as well as the header label.
- **Wording.**
  - Font check: the font must actually load a face.
  - A canvas or encoder failure has its own message.
  - The parent-facing labels say "poster" instead of "ছবি" (photo).
  - The acknowledgement names the phone number.
  - An expired cookie no longer says "start again" (OD-024-2).
  - Added the running matching state.
  - Applied the Bengali review's suggested wording.
- **Focus and error links.** Focus goes to the first missing control, each control has its own message, and an error is referenced only while it is shown. The text block is named by its heading (`role="group"`), and the canvas is described by the poster text.
- **Structure.** Shared UI and hooks moved out of the `"use client"` files, status labels got their own module, and there is an `AbortSignal.timeout` fallback.
- **Tests.** The vacuous assertions were replaced, and new tests cover strictness, Retry-After, a connection drop mid-request, guard order and stale runs.

`2424588` restores three teammate test files (`tests/outputs/{guard,service,templates}.test.ts`) that Prettier had reformatted. The PR does not change them.

Re-run after the fixes:
- `npm run lint` 0 · `npm run typecheck` 0
- `npm test` 1317 passed, 142 skipped
- `npm run build` 0

### Built-app smoke, second round (after the fixes, same setup)

**Focus and announcements:**
- After the GD text loads, focus is on the text block and "লেখা তৈরি হয়েছে" is announced.
- "Make" with no choice puts focus on the first radio and announces "ফোন নম্বর রাখবেন কি না বেছে নিন।".
- With a choice but no tick, focus goes to the checkbox and "বুঝেছেন জানাতে বাক্সে টিক দিন।" is announced.
- When the poster is ready, focus is on the download link and "পোস্টার ডাউনলোডের জন্য তৈরি" is announced.
- Copying twice announces "কপি হয়েছে" both times.

**Race:**
- Starting a render with "include" and switching to "omit" at once leaves no download link and a hidden canvas.
- A double tap gives exactly one download link.
- The resulting PNG has no phone and carries the draft footer.

**Layout:** overflow is 0 at 1280 px (idle and fully expanded), 390 px (English, expanded) and 320 px with a 200 % root font (poster ready).

**Captures:** `desktop.png`, `desktop-expanded-bn.png`, `5-summary-open-bn-390.png`, `6-expanded-en-390.png`, `7-poster-ready-bn-320-200pct.png` and `poster-omit.png`. They are in the session scratchpad, not committed.

**Cleanup:** the smoke database was dropped and Docker stopped afterwards.

### Second round: impeccable finish review and re-reviews (head `2424588`), fixes (this commit)

- **safeguarding: PASS** (WARNs fixed: `,` `/` `_` separators; evidence corrected).
- **a11y: PASS**, both BLOCKs closed (WARNs fixed: stale status text, nested regions, Latin runs, retry focus, empty live-region gaps).
- **react: BLOCK, fixed.** Focus and announcements were tied to locale strings, so a language toggle moved focus into an open card and re-announced it. They now fire only on a status change (`useOnChange`). The stale "poster ready" message is cleared when the choice or acknowledgement changes, and the status text is cleared on a language change.

**impeccable finish review: fix, applied.**
- Reflow at 320 px / 200 %: the label spans can wrap, the call link is `max-w-full`, and the reference never splits.
- Parent reading text is 18 px / 1.7 (DESIGN override).
- The reference is the focal mono element.
- Empty live regions take no space.
- Card titles describe the output, and the open buttons are secondary (one primary per decision).
- The 13219 link is in the header.
- An English-mode note says the draft text is Bangla.

Not taken from the finish review:
- D4 §10's "…সতর্কবার্তা পাঠায় না…" sentence. The outputs wording guard blocks "সতর্ক"; the existing no-filing line and call link cover it.
- The clear-device action (D4 §15). It belongs to the intake local store (Obidit), which isn't built, so it is recorded as OD-024-6.
- Poster typographic hierarchy. The layout keeps the template's line order (OD-023-3 wording review first).

Re-run after the fixes:
- `npm run lint` 0 · `npm run typecheck` 0
- `npm test` 1323 passed
- `npm run build` 0

### Built-app smoke, third round (final code, same setup)

- **Language toggle:** focus stays on the toggle; after the switch the page is English and the status region is empty.
- **Poster:**
  - Ready announces "পোস্টার ডাউনলোডের জন্য তৈরি".
  - Switching to "omit" removes the download link and clears that message.
  - The "omit" PNG has no phone and carries the footer.
- **Reflow:**
  - No element pokes out of its card, label, link or button at 390 px (bn and en) or 320 px / 200 %.
  - The reference stays on one line at 320 px / 200 %.
  - Page overflow is 0 at 1280 px, idle and expanded.
- **Type:** the reading text computes to 18 px / 1.7 (36 px / 61.2 px at 200 %).
- **Captures:** `desktop.png`, `desktop-expanded-bn.png`, `1-idle-bn-390.png`, `5-summary-open-bn-390.png`, `6-expanded-en-390.png`, `7-poster-ready-bn-320-200pct.png`, `poster-omit.png` (session scratchpad).
- **Cleanup:** the smoke database was dropped and Docker stopped.

## Not done

- **Playwright journey and axe (TASK-038).** That journey would need to check the PNG bytes, approve a Bangla screenshot, and cover 400 % zoom and a screen-reader walk.
- **Impeccable finish review:** done as part of fera-review only, not as a separate `/impeccable` pass.
- **Not connected yet:** nothing links to `/report/<id>`. S-003 (Obidit, TASK-022 part 2) should open it after API-003 succeeds, as should the duplicate-submission replay (D3 row 4).
- **D4 "clear-device" step (OD-024-6):** belongs to the intake local store (Obidit), which isn't built; UNKNOWN here.
- **Human review:** a person still needs to review the template wording (OD-023-3) and the new strings without a source (OD-024-4).
- **Latin runs in Bangla output text:** `[MOCK]` and the reference code are not wrapped in `lang="en"`, because the text is one `<pre>` from API-006 (a11y WARN, kept).
- **No jsdom or Playwright test of the client cards.** The render-run rules are unit-tested through `renderPoster`, and focus and announcements were checked in the browser smoke.

## Open decisions

OD-024-1 to OD-024-6 in `specs/001-platform-foundation/contract-notes.md` ("SCREEN-004 open decisions (TASK-024)"), plus OD-023-1 and OD-023-2 implemented as proposed (Obidit still to acknowledge).
