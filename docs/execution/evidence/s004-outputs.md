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
| Reference card, COMP-033 | `page.tsx`, `src/app/components/status-badge.tsx` | Large mono reference (`lang="en"`). The badge is icon + text + colour with the D3 labels খোলা / যাচাই চলছে / বন্ধ. The matching line uses D4 wording ("মিল খোঁজা হবে", "মিল খোঁজা হয়েছে", and the §15.1 failure line). "ফেরা পুলিশে জিডি জমা দেয় না।" sits under the card. |
| COMP-030 output cards | `output-card.tsx`, `copy.ts`, `src/lib/outputs-client.ts` | GD draft, poster and 13219 summary. API-006 is called only when the parent taps the button. Each card shows the "খসড়া — নিজে জমা দিন" label. Text goes in a focusable `<pre lang="bn">`. "তৈরি হচ্ছে…" and "কপি হয়েছে" are announced politely, re-keyed per copy. Without the Clipboard API (plain HTTP), the text is selected and the card says "copy it yourself" instead of claiming it was copied. Errors use catalogue copy on a neutral surface with an icon; E-004, E-019 and E-020 have no retry. |
| COMP-031 poster | `poster-share.tsx`, `src/lib/poster.ts` | Preview text, then the D4 §15.1 share notice. The contact radios have no default, and a separate acknowledgement checkbox follows. Only then can the parent make the image. Declining removes the fixed contact line and fails closed if any phone number remains (OD-023-1). Before drawing, the page waits up to 5 s for Noto Sans Bengali (both weights, `document.fonts.check`); otherwise it makes no image. Body text runs from 40 px down to 24 px, then "too long, copy the text". The context type has no image-drawing method. Download: `fera-poster-<ref>-draft.png`. Changing the choice revokes the old image. The canvas is `role="img"` with the text shown beside it. |
| Locked reports | `page.tsx` | When the report is not editable or the owner view has no draft, the output actions are hidden and a neutral note plus `tel:13219` are shown (OD-023-2). |
| Copy | `src/locales/index.ts` | 36 keys in bn and en. From the spec: status labels, matching lines, draft label, ACT-009/010/011 labels, "তৈরি হচ্ছে…", "কপি হয়েছে", the poster share line, the no-filing line. Without a source: OD-024-4. The outputs guard test scans every locale string and finds no banned term. |
| Icons | `src/app/components/icons.tsx` | Lucide Copy, Download, Phone, CircleDot, GitCompare, FileText, LayoutTemplate, inlined. |

## Verification (2026-10-16, local)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 1278 passed, 142 skipped (the DB suites) |
| `npm run build` | 0 | new route `/report/[id]`; `.next` removed afterwards |
| `npm run test:db` | not run | this lane adds no SQL; `requireOwnCase` uses the existing `readCase` |

New tests (52):
- `tests/outputs/poster.test.ts` (14):
  - The API-006 poster has exactly one contact line, and the phone appears only there. This pins Obidit's template for the contact choice.
  - Include leaves the text unchanged; decline drops exactly one line and keeps 13219.
  - Three "number still present" cases fail closed.
  - Line roles; wrapping inside the width; grapheme splitting that never breaks a conjunct.
  - Layout fits with 13219, phone, draft label and reference inside the margins; a declined poster has no phone; long text shrinks and very long text is `too-long`.
  - Paint draws white first, then text only; the file name.
- `tests/outputs/outputs-client.test.ts` (17):
  - The request shape (POST, same-origin, no-store, timeout signal).
  - Offline is E-024 with no request; rejection or timeout is E-021; a non-contract body or the wrong type is E-021.
  - HTTP and body mapping: 422 E-016, 429 E-020, 404 E-004, 401 E-002 → E-019, 500/503 E-021. Retry-After is honoured, and E-024 is never taken from a body.
  - Catalogue copy with Bangla numerals; retry and limit rules; the reducer; D3/D4 labels for every status group and matching state; OD-023-2.
- `tests/auth/require-own-case.test.ts` (5): owner view returned; absent and not-owned each write one audit row, then not-found; a non-owner projection is refused; an audit failure throws `PageAuditUnavailableError`.
- `tests/ui/report-screen.test.ts` (16: 7 screen, 3 badge, 6 static scans, one per file):
  - The guard call, the parent surface, the mono reference, the badge, the matching line, the no-filing line.
  - Three draft labels and three D3 actions, with no draft name or phone in the page.
  - English mode; `tel:13219` at least 44 px; the locked and no-draft states; no `danger` and every button at least 44 px.
  - The badge for each status group.

### Built-app smoke (`next start`, headless Chrome 155 over CDP)

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

## Not done

- **Playwright journey and axe (TASK-038).** That journey would need to check the PNG bytes, approve a Bangla screenshot, and cover 400 % zoom and a screen-reader walk.
- **Impeccable finish review:** done as part of fera-review only, not as a separate `/impeccable` pass.
- **Not connected yet:** nothing links to `/report/<id>`. S-003 (Obidit, TASK-022 part 2) should open it after API-003 succeeds, as should the duplicate-submission replay (D3 row 4).
- **D4 "clear-device" step:** belongs to the intake local store (Obidit), which isn't built; UNKNOWN here.
- **Human review:** a person still needs to review the template wording (OD-023-3) and the new strings without a source (OD-024-4).

## Open decisions

OD-024-1 to OD-024-4 in `specs/001-platform-foundation/contract-notes.md` ("SCREEN-004 open decisions (TASK-024)"), plus OD-023-1 and OD-023-2 implemented as proposed (Obidit still to acknowledge).
