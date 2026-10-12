# D4 — UI/UX Design Brief — Fera

| Field | Value |
|---|---|
| Version | 2.0 |
| Date | 11 Oct 2026 (Asia/Dhaka, UTC+6) |
| Owner | Sadman Shaharier (design shared across team) |
| Authors | Sadman Shaharier; Obidit Islam |
| Status | V2 team handover; implementation status UNVERIFIED |
| Companion | `tokens_v2.css` — byte-identical copy of §16 |
| Inputs | D1, D2 Parts A/B and D3 V2.0; tokens_v2.css; validation report. |

## V2 release contract

**Authors:** Sadman Shaharier and Obidit Islam. **Version:** 2.0. **Issued:** 11 October 2026, Asia/Dhaka (UTC+6).

This is the revised team specification, not evidence that the application has been built. Actual repository progress, account configuration, interviews, evaluations, and spend remain **UNVERIFIED** until evidence is attached. V1 defaults are superseded by the V2 rules below; existing requirement IDs are retained.

- This release is a **synthetic-data prototype**. Officer verification and referral delivery are simulated and labelled. The schema rejects records marked non-synthetic; the application must also prevent real reports from entering this release.
- A candidate score is similarity, not identity probability. A reviewer decision does not establish guardian authority or safe reunification. A referral row means **referral recorded**, not delivered or acknowledged.
- Draft payload stays on the device before report confirmation, but providers process audio/text beforehand with a notice. Only expiry/counter/hash metadata and cost reservations are stored server-side before submission.
- Possible duplicates remain visible. Shared phone alone never establishes one child. No physical child-return action is performed by Fera.
- Counts distinguish missing-report rows, found-report rows, and confirmed pairs. They are not a census of unique children or proof of rescue.
- Sources, diagrams, tables, code blocks, and acceptance criteria are part of the handover. The companion code must match the embedded code exactly. [Team handover](TEAM_HANDOVER_V2.md) records change closure, evidence gaps, and release gates.

## Changes to earlier documents

V2 corrects border contrast, narrow officer layouts, shortcut controls, report-count labels and provider/referral wording. ASCII sketches are replaced by structured layout specifications. The CSS companion is the exact embedded source.

---

## 1 Design objective

A frightened parent on a mid-range Android phone completes a reviewed Bangla report in ≤ 5 min (GOAL-001). An officer at a desk decides a match on evidence in ≤ 2 min (PERSONA-002). Nothing on screen sensationalises a child.

## 2 Principles

| # | Principle | Test |
|---|---|---|
| 1 | Bangla first, plain words | Every parent string reads at a primary-school level; no legal terms without a gloss |
| 2 | One thing at a time | Parent screens show one question or one decision per view |
| 3 | Show what the AI understood | Every extracted field is visible and editable before submit |
| 4 | Calm, not alarming | No red banners, countdowns or flashing on parent screens |
| 5 | Evidence before decision | Officer never sees confirm without both records side by side |
| 6 | Honest labels | "খসড়া" (draft), "সিনথেটিক" (synthetic), "ক্যাশ" (cached), [MOCK] always visible |
| 7 | Status never by colour alone | Icon + text + colour on every status |

## 3 Brand personality

Calm, trustworthy, urgent but not alarming. Voice of a steady neighbour who knows the process. Never: dramatic imagery, child photos, "runaway" language, exclamation-mark urgency, alert-style sirens.

## 4 User contexts

| Context | Parent (PERSONA-001) | Officer (PERSONA-002) | Staff (PERSONA-003) |
|---|---|---|---|
| Device | Android phone, 360–412 px wide, 4G, often one hand | Laptop/desktop, 1280–1920 px, mouse + keyboard | Phone or shared desk PC |
| State | Distressed, time-pressured, may be outdoors | Focused, many cases, accountable | Busy, interrupted |
| Need | Reassurance, few steps, voice | Density, comparison, keyboard speed | Short form, quick save |

## 5 Information architecture

| Area | Screens |
|---|---|
| Parent (no account) | Welcome (SCREEN-001) → Intake (SCREEN-002) → Review (SCREEN-003) → Outputs (SCREEN-004); Manual form (SCREEN-005); Status (SCREEN-006) |
| Staff | Sign-in (SCREEN-008) → Found-child log (SCREEN-007); Disaster mode (SCREEN-015) |
| Officer | Queue (SCREEN-009) · Match review (SCREEN-010) · Map (SCREEN-011) · Case detail (SCREEN-012) · Duplicates (SCREEN-014) |
| Admin | Data tools (SCREEN-013); aggregate map/table and metadata-only case detail |
| Shared | Not found (SCREEN-016) |

Officer top nav: "যাচাই তালিকা" / Review queue · "মানচিত্র" / Map · "সাইন আউট" / Sign out.

## 6 Visual direction

### 6.1 Palette (light)

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--color-bg` | #FAFAF7 | Page | text 15.20:1 |
| `--color-surface` | #FFFFFF | Cards | text 15.90:1 |
| `--color-surface-2` | #F1F3F2 | Chat bubbles, table stripes | — |
| `--color-text` | #1B2421 | Body text | 15.90:1 on surface |
| `--color-text-muted` | #4E5A55 | Secondary text | 7.20:1 on surface; 6.88:1 on bg |
| `--color-border` | #6F7D77 | Input borders | 4.31:1 on surface; minimum 3.86:1 across all three surfaces |
| `--color-primary` | #0F5C55 | Buttons, links (deep teal) | 7.83:1 on surface |
| `--color-on-primary` | #FFFFFF | Text on primary | 7.83:1 |
| `--color-focus` | #2457C5 | Focus ring | 6.47:1 on surface |
| `--status-open-fg` / `-bg` | #7A4F00 / #FFF3D6 | Open (amber) | 6.46:1 |
| `--status-matched-fg` / `-bg` | #1E4E9C / #E3EDFC | Matched (blue) | 6.78:1 |
| `--status-closed-fg` / `-bg` | #1E6B3A / #E2F3E8 | Closed (green) | 5.66:1 |
| `--color-danger-fg` / `-bg` | #B42318 / #FDECEA | Officer-side destructive and field errors only | 5.75:1 |

### 6.2 Palette (dark)

| Token | Hex | Contrast |
|---|---|---|
| `--color-bg` | #111816 | text 15.32:1 |
| `--color-surface` | #18211E | text 14.01:1 |
| `--color-surface-2` | #212C28 | — |
| `--color-text` | #E8EEEB | 14.01:1 on surface |
| `--color-text-muted` | #A9B5B0 | 7.78:1 on surface |
| `--color-border` | #82938B | 5.09:1 on surface; minimum 4.46:1 across all three surfaces |
| `--color-primary` | #5FC4B8 | 7.90:1 on surface |
| `--color-on-primary` | #0B1F1C | 8.21:1 on primary |
| `--color-focus` | #8AB4F8 | 7.81:1 on surface |
| Open fg / bg | #F2C14E / #33290F | 8.54:1 |
| Matched fg / bg | #8DB4F5 / #172640 | 7.19:1 |
| Closed fg / bg | #7FD39A / #14301F | 7.94:1 |
| Danger fg / bg | #F28B82 / #3A1714 | 6.70:1 |

V2 ratios are recalculated with the WCAG 2.x relative-luminance formula on 11 Oct 2026. These verify the listed colour pairs; full rendered accessibility, focus, zoom, reflow and screen-reader tests remain pending.

### 6.3 Typography

| Item | Value |
|---|---|
| Bangla | Noto Sans Bengali (Google Fonts), weights 400, 600 |
| Latin pair | Noto Sans (Google Fonts), weights 400, 600 — matched x-height and stroke with the Bangla face |
| Loading | Self-hosted woff2 subsets, `font-display: swap`; Bangla subset preloaded on parent routes |
| Scale | 14 / 16 / 18 / 22 / 28 px (`--font-size-sm` … `--font-size-2xl`) |
| Parent body | 18 px, line-height 1.7 (Bangla conjuncts and matras need room) |
| Officer body | 16 px, line-height 1.55 |
| Numerals | Bangla numerals on parent screens; officer screens show both where space allows ("১৩ / 13") |

### 6.4 Spacing, radius, elevation, icons, illustration

| Item | Value |
|---|---|
| Spacing | 4-px base: 4, 8, 12, 16, 24, 32, 48, 64 |
| Radius | 6 px inputs, 10 px cards, 16 px sheets, 999 px pills |
| Elevation | Level 1 cards: `0 1px 2px rgba(0,0,0,.08)`; level 2 dialogs: `0 8px 24px rgba(0,0,0,.16)` |
| Icons | Outline, 1.75 px stroke, 20/24 px (Lucide set); always paired with text on actions and statuses |
| Status icons | Open: circle-dot; Matched: git-compare; Closed: circle-check; Referral recorded: hand-heart with simulation text |
| Illustration | Simple flat line drawings of places (house, station, map pin). No children's faces, no stock photos, no silhouettes of lone children |

## 7 Layout and responsive behaviour

| Breakpoint | Layout |
|---|---|
| < 600 px | Parent screens single column, max width 480 px, sticky bottom action bar (safe-area aware) |
| 600–1023 px | Staff form two-column for structured fields; officer screens stack columns |
| ≥ 1024 px | Officer: 12-column grid, max 1280 px; match review two equal columns + 320 px decision panel; map 2/3 + table 1/3 |

Text scales to 200 % without horizontal scroll on parent screens. Tap targets ≥ 44 × 44 px.

## 8 Component inventory

| ID | Component | Used on | Key states |
|---|---|---|---|
| COMP-022 | App header with language toggle | All | bn / en |
| COMP-023 | Synthetic badge "সিনথেটিক" | Any seeded record | — |
| COMP-024 | Chat bubble (assistant / user) | SCREEN-002 | sending, sent, error |
| COMP-025 | Voice record button with timer | SCREEN-002, SCREEN-007 | idle, requesting, recording, uploading, disabled |
| COMP-026 | Transcript editor | SCREEN-002 | editable, saved |
| COMP-027 | Question prompt with quick-reply chips | SCREEN-002 | — |
| COMP-028 | Editable field card | SCREEN-003, SCREEN-007 | filled, unknown, error, edited |
| COMP-029 | Confirm bar (checkbox + submit) | SCREEN-003, SCREEN-007 | disabled until checked, submitting |
| COMP-030 | Output card with copy | SCREEN-004 | loading, ready, copied, limit reached |
| COMP-031 | Poster preview + PNG download | SCREEN-004 | rendering, ready |
| COMP-032 | Manual case form | SCREEN-005 | prefilled, error |
| COMP-033 | Status badge (icon + text + colour) | SCREEN-004, -006, -009, -011, -012 | open, matched, closed, referred |
| COMP-034 | Found-child form | SCREEN-007, SCREEN-015 | — |
| COMP-035 | Review queue list | SCREEN-009 | loading, empty, populated |
| COMP-036 | Candidate row (rank, score, reason) | SCREEN-009 | focused, opened |
| COMP-037 | Side-by-side evidence table | SCREEN-010, SCREEN-014 | agree, differ, unknown per row |
| COMP-038 | Decision panel (confirm / reject + reason) | SCREEN-010 | idle, confirming dialog, submitting |
| COMP-039 | Close-case dialog | SCREEN-012 | outcome chosen, note entered |
| COMP-040 | District map | SCREEN-011 | tiles, no-tiles fallback |
| COMP-041 | District table | SCREEN-011 | sorted by open count |
| COMP-042 | Audit timeline | SCREEN-012 | — |
| COMP-043 | Admin action panel | SCREEN-013 | typed confirmation |
| COMP-044 | Inline alert / toast | All | info, success, error |
| COMP-045 | Empty state | SCREEN-006, -009, -013, -016 | — |
| COMP-046 | Loading state with 10 s message | SCREEN-002, -004, -007 | < 10 s, ≥ 10 s |
| COMP-047 | Sign-in form | SCREEN-008 | error, rate-limited |
| COMP-048 | Cached badge "ক্যাশ" | Any AI output from demo cache | — |
| COMP-049 | Duplicate banner "সম্ভাব্য একই শিশু" | SCREEN-010, SCREEN-012 | — |
| COMP-050 | Consent notice | SCREEN-001 | — |

## 9 Interaction guidelines

| Interaction | Rule |
|---|---|
| Voice record | Tap to start, tap to stop (no press-and-hold). Live timer "০:৩৮ / ২:০০". Auto-stop at 120 s. Haptic tick on start/stop where supported. After stop: "পাঠাচ্ছি…" / Sending…. Transcript appears in an editable box with "ঠিক আছে, পাঠান" / OK, send. |
| Review before register/export; provider notice earlier | Cards in the order the parent spoke. Unknown fields read "অজানা — যোগ করুন" / Unknown — add. Required-field errors are visible; submit stays disabled until "আমি যাচাই করেছি" / I have checked is ticked. |
| Side-by-side evidence | Missing on the left, found on the right, same field order. Row verdict icon + word. Reason line and score on top; score labelled "মিলের মাত্রা ৮৭/১০০" / Similarity 87/100, never "%" or "probability". |
| Confirm / reject | Confirm opens a dialog restating the referral rule; focus starts on "ফিরে যান" / Go back. Reject requires a reason (min 3 chars) and quick chips: "বয়স মেলে না" / Age differs, "জেলা দূরে" / District far, "পোশাক আলাদা" / Clothing differs. |
| Copy and download | Copy shows "কপি হয়েছে" for 2 s and announces it. Poster PNG 1080 × 1350 px, white background, Bangla text, 13219 and the explicitly chosen contact option, "খসড়া" footer. |
| Keyboard (officer) | `J/K` or ↑/↓ move in queue; `Enter` open; `C` confirm (opens dialog); `R` reject; disabled while typing and switchable/remappable; `Esc` close dialog. Shortcuts listed under "?" |

## 10 Microcopy guidelines

| Rule | Bangla / English example |
|---|---|
| Address the parent with respect (আপনি) | "আপনার শিশুর কথা বলুন" / Tell us about your child |
| Say what happens next | "জমা দেওয়ার পর জিডি খসড়া ও পোস্টার পাবেন" / After submitting you'll get a GD draft and poster |
| Never promise outcomes | Not "আমরা খুঁজে দেব" / We will find. Use "মিল খোঁজা হবে" / Matches will be checked |
| State Fera's limits | "ফেরা পুলিশ বা সিআইডি-কে সতর্কবার্তা পাঠায় না। জরুরি হলে ১৩২১৯-এ কল করুন।" / Fera does not alert police or CID. In an emergency, call 13219. |
| Neutral words about the child | "শেষবার দেখা গিয়েছিল" / Last seen; never "পালিয়ে গেছে" / ran away |
| Errors: what happened + what to do | "কথাগুলো পরিষ্কার শোনা যায়নি। আবার বলুন বা লিখে দিন।" / We couldn't hear that clearly. Try again or type. |
| Officer copy may be denser | "৩টি সম্ভাব্য মিল · সর্বোচ্চ ৮৭" / 3 likely matches · top 87 |

## 11 Forms and validation

| Field | Input | Validation | Message (Bangla / English) |
|---|---|---|---|
| Age | Numeric keypad; accepts ০–৯ and 0–9; range option | 0–17 (missing) | "বয়স ০ থেকে ১৭-এর মধ্যে দিন" / Enter an age from 0 to 17 |
| Sex | 4 large buttons | Required | "একটি বেছে নিন" / Choose one |
| District | Searchable list, Bangla + English names, aliases ("চট্টগ্রাম / Chattogram / Chittagong") | One of 64 | "তালিকা থেকে জেলা বেছে নিন" / Pick a district from the list |
| Last seen | Date + part-of-day chips (সকাল, দুপুর, বিকেল, সন্ধ্যা, রাত) or exact time | Not in future | "ভবিষ্যতের সময় দেওয়া যাবে না" / The time can't be in the future |
| Phone | `inputmode="tel"`; Bangla digits accepted | `^01[0-9]{9}$` after conversion | "০১ দিয়ে শুরু ১১ সংখ্যার নম্বর দিন" / Enter an 11-digit number starting 01 |
| Free text | Auto-growing textarea | 20–2,000 chars | "আরও একটু বিস্তারিত লিখুন" / Please add a little more detail |

Validate on blur and on submit, never on each keystroke. Errors appear under the field, linked by `aria-describedby`, plus a summary at the top on submit.

## 12 Loading, empty, success and error states

| State | Pattern |
|---|---|
| Loading < 300 ms | Nothing shown |
| Loading 300 ms – 10 s | COMP-046 spinner + verb ("বুঝে নিচ্ছি…" / Understanding…) |
| Loading ≥ 10 s | "এখনও কাজ চলছে, একটু অপেক্ষা করুন" / Still working, please wait + "ফর্মে লিখুন" / Use the form link |
| Empty | COMP-045 line illustration + one sentence + one action |
| Success | Inline confirmation; parent screens use teal check, never confetti |
| Error | COMP-044 with message from D2 Part B §13; parent errors use neutral surface with icon, not red fill |

## 13 Accessibility (WCAG 2.2 AA)

| Requirement | Implementation |
|---|---|
| Keyboard access | All actions reachable by Tab; officer shortcuts (§9); dialogs trap focus and restore it |
| Visible focus | 3 px `--color-focus` outline, 2 px offset; never hidden by sticky bars (2.4.11) |
| Contrast | Text ≥ 4.5:1; Control-identifying boundaries ≥ 3:1 against every adjacent surface; decorative separators excluded (§6) |
| Labels | Every input has a visible label; icons have `aria-label` in the current language |
| Alt text | Illustrations decorative (`alt=""`); poster PNG has a text equivalent shown beside it |
| Captions / transcripts | Every voice note has its editable transcript; audio is never the only record |
| Clear errors | Field + summary; error text says how to fix |
| Target size | ≥ 44 × 44 px (exceeds 2.5.8 minimum of 24 px) |
| Responsive text | 320 CSS px reflow, 200 % text zoom and 400 % viewport zoom without loss; `rem` units |
| No colour-only status | COMP-033 always icon + text + colour |
| Language | `lang="bn"` / `lang="en"` set per element for screen readers |
| Redundant entry | Draft reused across S-002 → S-003 → S-005; parent never retypes (3.3.7) |
| Motion | No auto-animation; respects `prefers-reduced-motion` |

## 14 Screen-by-screen descriptions

| Screen | Description |
|---|---|
| SCREEN-001 | Logo wordmark "ফেরা", 2-line explanation, consent notice, Start button, small `tel:13219` link. |
| SCREEN-002 | Chat column; assistant bubble left, parent right; large round mic button above a text box; transcript box after recording; one question at a time with quick-reply chips. |
| SCREEN-003 | Title "যা বুঝেছি" / What we understood; stacked field cards with edit icons; "অজানা" chips; checkbox + submit in sticky bar. |
| SCREEN-004 | Reference "M-7K3Q2A" in large mono digits; status badge "খোলা"; three output cards; poster preview; 13219 call link. |
| SCREEN-005 | Plain one-column form with the same fields as SCREEN-003; banner explains the assistant was unavailable. |
| SCREEN-006 | Reference, status badge, last updated time, "তথ্য সংশোধন" button when editable. |
| SCREEN-007 | Free-text box + structured fields side by side on desktop; save card shows ref "F-…" and "মিল খোঁজা হয়েছে". |
| SCREEN-008 | Centered form, role named in title ("কর্মকর্তা সাইন ইন" / Officer sign-in). |
| SCREEN-009 | Table: rank-1 score, missing ref, child summary, district, candidate count, newest time; filter by district. |
| SCREEN-010 | Header with score, reason, duplicate banner; two columns of fields with verdict icons; right decision panel. |
| SCREEN-011 | Map with district markers sized by total and labelled with three counts; adjacent table; totals strip; synthetic toggle. |
| SCREEN-012 | Case fields, status badge, linked duplicates, referral card, close button, audit timeline. |
| SCREEN-013 | Three panels: verify officers [MOCK], redact identifying payloads (typed confirm), import (Should). |
| SCREEN-014 | Two same-kind records side by side; "একই শিশু" / "আলাদা" buttons. |
| SCREEN-015 | Found-child form with "পরিকল্পিত সম্প্রসারণ" banner. |
| SCREEN-016 | Line illustration, "তথ্যটি পাওয়া যায়নি", home link. |

## 15 Layout specifications

These replace ASCII wireframes with precise responsive regions. PDF diagrams are vector-rendered; the source diagrams remain editable.

| Screen/layout | Regions in reading order | Behaviour |
|---|---|---|
| Parent intake | Header/language; processing notice; synthetic badge; conversation; editable transcript; text/voice controls; manual fallback | One column at 320px, voice never sole input; live status announced |
| Parent review | Required-field summary; child; event interval/place/district; reporter contact; accuracy confirmation; submit | Known values preserved; unknown mandatory fields linked to manual completion |
| Submitted/output | Reference and matching state; GD text; poster preview/contact choice; share acknowledgement; download; clear-device | Fixed draft label; no police filing or alert claim |
| Found entry | Role and synthetic cue; description; optional age; place/district/time/contact; review/save | Own found-only intake; no candidate payload in response |
| Officer queue | Role; district filter; missing/found report basis; current qualified candidates; empty/failed state | Tab navigation plus optional focus-scoped shortcuts; no auto hidden duplicates |
| Candidate review | Similarity label; versions; side-by-side supported values; unknown/contradiction rows; checklist; confirm/reject | Stack columns on narrow viewport; reason required on reject; score not identity proof |
| Decision dialog | Simulated-referral warning; reviewer checklist; Go back first; explicit decision | Focus trapped/restored; no keyboard shortcut triggers in note fields |
| Dashboard | Missing report counts; found report counts; confirmed pairs; district outlines; table; officer drill-through | Table alternative, zero districts, exact counting labels; no unique-child/recovery implication |
| Admin | Metadata; mock user list/verify; eligible redaction summary and typed confirmation | No child/candidate detail; external-copy redaction limitation stated |

## 15.1 Required V2 microcopy

| Moment | Bangla | English |
|---|---|---|
| Demo banner | সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন | Synthetic data · officer verification simulated |
| Provider notice | কথা বা লেখা বোঝার জন্য বাইরের এআই সেবা ব্যবহার হতে পারে। এই সংস্করণে বাস্তব শিশুর তথ্য দেবেন না। | External AI may process audio/text. Do not enter real child information in this version. |
| Before submit | জমা দেওয়ার আগে তথ্য যাচাই করুন। ফেরা পুলিশে জিডি জমা দেয় না। | Review before submission. Fera does not file a police GD. |
| Confirm result | পর্যালোচকের সিদ্ধান্ত নথিভুক্ত। রেফারেল নথিভুক্ত (সিমুলেশন)। | Reviewer decision recorded. Referral recorded (simulation). |
| Score warning | মিলের মাত্রা পরিচয়ের প্রমাণ নয়। | Similarity is not proof of identity. |
| Duplicate cue | সম্ভাব্য একই শিশু · আলাদা প্রতিবেদন দৃশ্যমান | Possible duplicate · separate reports remain visible |
| Poster share | প্রকাশের আগে নম্বর ও স্থানের তথ্য দেখুন। ডাউনলোড করা কপি ফেরা মুছতে পারে না। | Review phone/location before sharing. Fera cannot remove downloaded copies. |
| Matching failure | প্রতিবেদন জমা হয়েছে। মিল খোঁজা সম্পূর্ণ হয়নি; আবার চেষ্টা করুন। | Report saved. Matching is incomplete; retry. |
| Cached fixture | ক্যাশ · পূর্বপ্রস্তুত সিনথেটিক উদাহরণ | Cached · prepared synthetic example |
| Closure | সমন্বয়ের রেকর্ড বন্ধ হয়েছে; উদ্ধার নিশ্চিত করা হয়নি। | Coordination record closed; rescue is not established. |

## 16 Design tokens

The exact companion is tokens_v2.css. Control borders have been strengthened against all light/dark surfaces; component usage still needs visual and keyboard checks.

```css
/* Fera design tokens V2.0 - D4 section 16. Authors: Sadman Shaharier; Obidit Islam. Light default; dark via prefers-color-scheme or [data-theme]. */
:root {
  /* Colour — light */
  --color-bg: #FAFAF7;
  --color-surface: #FFFFFF;
  --color-surface-2: #F1F3F2;
  --color-text: #1B2421;
  --color-text-muted: #4E5A55;
  --color-border: #6F7D77; /* >= 3:1 against all three light surfaces */
  --color-primary: #0F5C55;
  --color-primary-hover: #0B4843;
  --color-on-primary: #FFFFFF;
  --color-focus: #2457C5;
  --status-open-fg: #7A4F00;
  --status-open-bg: #FFF3D6;
  --status-matched-fg: #1E4E9C;
  --status-matched-bg: #E3EDFC;
  --status-closed-fg: #1E6B3A;
  --status-closed-bg: #E2F3E8;
  --color-danger-fg: #B42318;
  --color-danger-bg: #FDECEA;

  /* Typography */
  --font-bn: "Noto Sans Bengali", "Noto Sans", system-ui, sans-serif;
  --font-latin: "Noto Sans", "Noto Sans Bengali", system-ui, sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  --font-size-sm: 0.875rem;   /* 14px */
  --font-size-md: 1rem;       /* 16px */
  --font-size-lg: 1.125rem;   /* 18px — parent body */
  --font-size-xl: 1.375rem;   /* 22px */
  --font-size-2xl: 1.75rem;   /* 28px */
  --font-weight-regular: 400;
  --font-weight-semibold: 600;
  --line-height-bn: 1.7;
  --line-height-officer: 1.55;

  /* Spacing (4px base) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Radius */
  --radius-input: 6px;
  --radius-card: 10px;
  --radius-sheet: 16px;
  --radius-pill: 999px;

  /* Elevation */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.08);
  --shadow-2: 0 8px 24px rgba(0, 0, 0, 0.16);

  /* Interaction */
  --focus-ring: 0 0 0 2px var(--color-surface), 0 0 0 5px var(--color-focus);
  --tap-target-min: 44px;
  --report-flow-min-width: 320px;
  --duration-fast: 120ms;
  --duration-base: 200ms;

  /* Layout */
  --parent-max-width: 480px;
  --officer-max-width: 1280px;
  --decision-panel-width: 320px;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-bg: #111816;
    --color-surface: #18211E;
    --color-surface-2: #212C28;
    --color-text: #E8EEEB;
    --color-text-muted: #A9B5B0;
    --color-border: #82938B; /* >= 3:1 against all three dark surfaces */
    --color-primary: #5FC4B8;
    --color-primary-hover: #7FD3C9;
    --color-on-primary: #0B1F1C;
    --color-focus: #8AB4F8;
    --status-open-fg: #F2C14E;
    --status-open-bg: #33290F;
    --status-matched-fg: #8DB4F5;
    --status-matched-bg: #172640;
    --status-closed-fg: #7FD39A;
    --status-closed-bg: #14301F;
    --color-danger-fg: #F28B82;
    --color-danger-bg: #3A1714;
    --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-2: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
}

:root[data-theme="dark"] {
  --color-bg: #111816;
  --color-surface: #18211E;
  --color-surface-2: #212C28;
  --color-text: #E8EEEB;
  --color-text-muted: #A9B5B0;
  --color-border: #82938B; /* >= 3:1 against all three dark surfaces */
  --color-primary: #5FC4B8;
  --color-primary-hover: #7FD3C9;
  --color-on-primary: #0B1F1C;
  --color-focus: #8AB4F8;
  --status-open-fg: #F2C14E;
  --status-open-bg: #33290F;
  --status-matched-fg: #8DB4F5;
  --status-matched-bg: #172640;
  --status-closed-fg: #7FD39A;
  --status-closed-bg: #14301F;
  --color-danger-fg: #F28B82;
  --color-danger-bg: #3A1714;
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-2: 0 8px 24px rgba(0, 0, 0, 0.5);
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-fast: 0ms;
    --duration-base: 0ms;
  }
}
```

## 17 Usability risks and mitigations

| Risk | Mitigation |
|---|---|
| Parent is distressed and cannot read long text | One question per view; voice first; 18 px text; no jargon |
| Parent expects Fera to alert police | Consent notice and output labels state Fera does not alert; `tel:13219` always visible |
| Parent fears data exposure | Consent notice lists who sees what; matched records officer-only; no photos |
| Child photo privacy | No photo field anywhere; poster is text only; demo uses synthetic text only |
| AI misheard details shared wrongly | Mandatory review with "আমি যাচাই করেছি" checkbox |
| Officer over-trusts the score | Score labelled similarity; evidence rows with verdicts; 2-step confirm; referral reminder |
| Officer fatigue / mis-click | Confirm dialog focuses "Go back"; reject needs reason |
| Bangla rendering breaks on low-end phones | Self-hosted Noto Sans Bengali subset; tested on 2 Android phones (TASK-036) |
| Map unreadable or offline | Table always shown beside map; tile-less fallback |
| Demo shows cached outputs as live | "ক্যাশ" badge on every cached output |

---

## IDs introduced

- COMP-022 App header with language toggle
- COMP-023 Synthetic badge
- COMP-024 Chat bubble
- COMP-025 Voice record button
- COMP-026 Transcript editor
- COMP-027 Question prompt
- COMP-028 Editable field card
- COMP-029 Confirm bar
- COMP-030 Output card
- COMP-031 Poster preview
- COMP-032 Manual case form
- COMP-033 Status badge
- COMP-034 Found-child form
- COMP-035 Review queue list
- COMP-036 Candidate row
- COMP-037 Side-by-side evidence table
- COMP-038 Decision panel
- COMP-039 Close-case dialog
- COMP-040 District map
- COMP-041 District table
- COMP-042 Audit timeline
- COMP-043 Admin action panel
- COMP-044 Inline alert / toast
- COMP-045 Empty state
- COMP-046 Loading state
- COMP-047 Sign-in form
- COMP-048 Cached badge
- COMP-049 Duplicate banner
- COMP-050 Consent notice

## IDs referenced

- SCREEN-001 – SCREEN-016 (D1)
- GOAL-001, PERSONA-001 – PERSONA-003 (00)
- TASK-036 (D6)

## V2 accessibility and export acceptance

Required: 320 CSS-pixel reflow, 200% text zoom, 400% viewport zoom; keyboard and Bangla screen reader walk; focus not obscured; live/error announcements; shortcut disable/remap or focus scope; no shortcuts while typing. Test actual control backgrounds and all states, not tokens alone. axe is complementary, not a conformance certificate. Parent forms remain usable without maps/audio. Test generated poster after fonts load with long Bangla/unknown fields and a text equivalent. Export remains light and readable regardless of UI theme.

References: [WCAG non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [shortcuts](https://www.w3.org/WAI/WCAG22/Understanding/character-key-shortcuts.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). No AA conformance claim is made before the implemented product is checked.
