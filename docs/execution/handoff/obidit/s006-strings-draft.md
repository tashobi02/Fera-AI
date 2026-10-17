> **Hand-off attachment.** Produced in Obidit's working lanes on 2026-10-16 (agent-assisted). Status: draft for TASK-049 (S-006), corrected by a second agent. New Bangla needs human review. Open questions are marked UNKNOWN.
> Local file paths and `file://` links inside point at Obidit's laptop lanes and do not resolve in this repository.

# B1 — SCREEN-006 bilingual copy draft

TASK-049 / FR-029; related FR-030 and TC-018/TC-019. This is a copy handoff, not an implemented or tested screen. No real child data or sample report IDs are included.

## Source and state coverage

D3_App_Flow_V2.md:144 lists loading (skeleton), empty, E-018/E-019 error and correction success. Loading text: D3 silent. Edit-submitting: D3 silent; do not add a separate state/key without a decision. D3_App_Flow_V2.md:148 names Open / Being checked / Closed. Those labels alone do not prove live matching, active officer review or an outcome.

D3_App_Flow_V2.md:478 also requires owner read API-004 alongside optional API-018/API-005. Supplemental API errors are E-004 (D2_TRD_PartA_V2.md:316), E-001/E-004/E-005/E-018 (D2_TRD_PartA_V2.md:326), and E-019 (D2_TRD_PartA_V2.md:458). E-007/E-021 are generic defensive copy, not additional errors explicitly listed for this screen; E-024 is a client-network path from D3_App_Flow_V2.md:332. No other SCREEN-006 state is specified: D3 silent.

D3 §7 supplies recovery strings and points to the D2 catalogue (D3_App_Flow_V2.md:471). D4_Design_Brief_V2.md:224 directs error patterns to D2 Part B §13. Supplementary catalogue wording is identified below; where D3 supplies a different exact English string, the row uses D3 and does not claim both wordings are identical. Strings absent from D3/D4 carry the requested review marker, even when borrowed from the supplementary catalogue. Existing locale keys retain their spelling and values; both language lines are cited. Existing draft locale text is reuse, not new human approval.

## Screen, state and error strings

| key | bn | en | source (D3/D4/D1 line, or "new — needs human Bangla review") | used for (state/element) |
|---|---|---|---|---|
| `caseStatusLoading` | D3 silent | D3 silent | D3_App_Flow_V2.md:144 | Loading: skeleton; these cells are documentation markers, never locale values. |
| `caseStatusEmpty` | এই ফোনে কোনো রিপোর্ট নেই | No reports on this phone | D3_App_Flow_V2.md:144 | Empty: no report for the current parent session. No cross-device lookup promise. |
| `caseEditSuccess` | সংশোধন জমা হয়েছে | Correction submitted | D3_App_Flow_V2.md:144 | Success: only after the reviewed edit is confirmed and API-005 acknowledges it; no matching-completion claim. |
| `errorEditLocked` | মিল নিশ্চিত হওয়ার পর কেস বদলানো যায় না। | Can't edit after a match is confirmed. | D3_App_Flow_V2.md:338 | Error E-018 EDIT_LOCKED. Exact D3 copy. D1 also forbids terminal edits; hide edit when confirmed/closed (D1_PRD_V2.md:362). |
| `errorSessionExpired` | আপনার খসড়ার সময় শেষ। নতুন করে শুরু করুন। | Your draft has expired. Please start again. | D3_App_Flow_V2.md:333 | Error E-019 SESSION_EXPIRED. Exact draft-expiry copy; submitted-session recovery: UNKNOWN (OQ-B1-3). Do not assert that a submitted case was deleted. |
| `statusOpen` | খোলা | Open | D3_App_Flow_V2.md:148 | COMP-033 badge; submitted/open are editable states (D1_PRD_V2.md:519). Full parent badge mapping needs OQ-B1-2. |
| `statusBeingChecked` | যাচাই চলছে | Being checked | D3_App_Flow_V2.md:148 | COMP-033 badge only; no candidate data, scores or assertion that an officer is currently working. |
| `statusClosed` | বন্ধ | Closed | D3_App_Flow_V2.md:148 | COMP-033 closed badge; does not establish a rescue or physical return. |
| `caseEditAction` | তথ্য সংশোধন | Correct details | D3_App_Flow_V2.md:142 | ACT-017; offer only when owner edit is authorised. Hidden when confirmed/closed (D1_PRD_V2.md:362). |
| `statusClosedDesc` | সমন্বয়ের রেকর্ড বন্ধ হয়েছে; উদ্ধার নিশ্চিত করা হয়নি। | Coordination record closed; rescue is not established. | D4_Design_Brief_V2.md:294 | Exact closure microcopy; only for a closed coordination record. |
| `demoBanner` | সিনথেটিক তথ্য · কর্মকর্তা যাচাই সিমুলেশন | Synthetic data · officer verification simulated | src/locales/index.ts:5; src/locales/index.ts:190; D4_Design_Brief_V2.md:285 (reuse) | Persistent synthetic/simulation notice. |
| `syntheticBadge` | সিনথেটিক | Synthetic | src/locales/index.ts:61; src/locales/index.ts:241 (reuse) | Synthetic report badge; no real child examples. |
| `welcomeNoAlerts` | ফেরা পুলিশ বা সিআইডি-কে সতর্কবার্তা পাঠায় না। জরুরি হলে ১৩২১৯-এ কল করুন। | Fera does not alert police or CID. In an emergency, call 13219. | src/locales/index.ts:53; src/locales/index.ts:233; D4_Design_Brief_V2.md:197 (reuse) | Fera limits notice; helpline is external, not a Fera-officer contact. |
| `colStatus` | অবস্থা | Status | src/locales/index.ts:164; src/locales/index.ts:341 (reuse) | Status field label. Reuse this key directly; do not create statusLabel. |
| `notFoundTitle` | তথ্যটি পাওয়া যায়নি। | We couldn't find that. | src/locales/index.ts:48; src/locales/index.ts:230; D3_App_Flow_V2.md:335 (reuse) | Error E-004 NOT_FOUND; same message for absent and unowned records. |
| `errorValidationFailed` | কিছু তথ্য ঠিক নেই। চিহ্নিত ঘরগুলো দেখুন। | Some details need fixing. Check the marked fields. | new — needs human Bangla review; D4_Design_Brief_V2.md:224 | Error E-001 VALIDATION_FAILED; verbatim supplemental catalogue copy, D2_TRD_PartB_V2.md:144. D3_App_Flow_V2.md:327 supplies the exact phone-specific variant below. |
| `errorPhoneInvalid` | সঠিক মোবাইল নম্বর দিন (০১ দিয়ে শুরু, ১১ সংখ্যা) | Enter a valid mobile number (starts 01, 11 digits) | D3_App_Flow_V2.md:327 | E-001 phone field error during review/edit, when phone validation actually fails. |
| `errorIllegalTransition` | কেসটির অবস্থা বদলে গেছে। পাতাটি আবার খুলুন। | This case has changed. Reload the page. | new — needs human Bangla review; D4_Design_Brief_V2.md:224 | Error E-005 ILLEGAL_TRANSITION; verbatim supplemental catalogue copy, D2_TRD_PartB_V2.md:148. Reload latest own state; never silently overwrite a version conflict. |
| `signInErrorRateLimited` | {s} সেকেন্ড পরে আবার চেষ্টা করুন। | Please try again in {s} seconds. | src/locales/index.ts:32; src/locales/index.ts:216 (reuse) | Error E-007 RATE_LIMITED; generic defence if surfaced, not listed as a SCREEN-006-specific error. Format {s} with Bangla numerals in bn. No countdown animation; follow D4_Design_Brief_V2.md:43. |
| `signInErrorRateLimitedSoon` | একটু পরে আবার চেষ্টা করুন। | Please try again in a little while. | src/locales/index.ts:33; src/locales/index.ts:217 (reuse) | E-007 fallback when cooldown duration is UNKNOWN; never invent seconds. |
| `signInErrorGeneric` | কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন। | Something went wrong. Please try again. | src/locales/index.ts:34; src/locales/index.ts:218 (reuse) | Error E-021 INTERNAL; generic unexpected failure, not listed as a SCREEN-006-specific error. Do not expose provider messages. |
| `errorNetworkOffline` | ইন্টারনেট সংযোগ নেই। আপনার তথ্য রাখা আছে — সংযোগ ফিরলে আবার পাঠান। | No internet. Your details are saved — send again when back online. | D3_App_Flow_V2.md:332 | Error E-024 NETWORK_OFFLINE; exact mid-upload text only after browser retention is verified. Do not use this saved-data claim for a failed status GET or an unretained edit; OQ-B1-4. |
| `startAction` | শুরু করুন | Start | src/locales/index.ts:58; src/locales/index.ts:238 (reuse) | Proposed single empty-state action; route choice UNKNOWN (OQ-B1-1). |
| `startAgainAction` | নতুন করে শুরু করুন | Start again | src/locales/index.ts:136; src/locales/index.ts:315 (reuse) | E-019 recovery for an expired unsubmitted draft only; submitted-session recovery UNKNOWN. |
| `retryAction` | আবার চেষ্টা করুন | Try again | src/locales/index.ts:118; src/locales/index.ts:298 (reuse) | Retry E-024/E-021 with the same reviewed edit/version; never clear local changes silently. |
| `callHelpline` | ১৩২১৯-এ কল করুন | Call 13219 | src/locales/index.ts:59; src/locales/index.ts:239 (reuse) | External emergency helpline link; no direct case-support or officer-contact promise. |
| `caseStatusTitle` | রিপোর্টের অবস্থা | Report status | new — needs human Bangla review | Draft screen heading; D3 gives no exact title. |
| `caseReferenceLabel` | রেফারেন্স নম্বর | Reference number | new — needs human Bangla review | Reference card label required by D4_Design_Brief_V2.md:253; exact label unspecified. |
| `lastUpdatedLabel` | সর্বশেষ আপডেট | Last updated | new — needs human Bangla review | Timestamp label required by D4_Design_Brief_V2.md:253; use actual owner-scoped updated time, not a guessed review time. |
| `lastUpdatedTime` | {date} তারিখে আপডেট করা হয়েছে | Updated on {date} | new — needs human Bangla review | Format the actual timestamp; Bangla numerals for bn date/time. Missing time remains unknownValue. |
| `viewStatusAction` | অবস্থা দেখুন | View status | new — needs human Bangla review | ACT-016 label; action exists at D3_App_Flow_V2.md:421, exact UI copy unspecified. |
| `caseStatusEmptyHint` | আগের রিপোর্ট দেখতে যে ব্রাউজার থেকে জমা দিয়েছিলেন, সেটি ব্যবহার করুন। | To view an earlier report, use the browser you submitted it from. | new — needs human Bangla review | Proposed hint only; same device without the original cookie is insufficient. Cross-device return unsupported (D3_App_Flow_V2.md:310); recovery UNKNOWN if cookie is absent. |
| `statusOpenDesc` | আপনার রিপোর্টের অবস্থা খোলা। | Your report status is open. | new — needs human Bangla review | Optional helper when status is open; does not assert active matching. |
| `statusBeingCheckedDesc` | আপনার রিপোর্টের অবস্থা এখানে দেখুন। | View your report status here. | new — needs human Bangla review | Optional badge helper; own editable fields remain role-scoped. No live-officer activity or no-action-needed claim (D1_PRD_V2.md:477). |
| `caseEditLockedHint` | এই অবস্থায় রিপোর্টের তথ্য সংশোধন করা যায় না। | Report details cannot be edited in this state. | new — needs human Bangla review | Optional lock helper; only for a noneditable owner report. No invented case-support contact. |
| `caseDetailsSectionTitle` | জমা দেওয়া তথ্যের সারসংক্ষেপ | Summary of submitted details | new — needs human Bangla review | Own fields only where editable/authorised; never another party’s fields (D1_PRD_V2.md:477). |
| `referralSimulatedNote` | পর্যালোচকের সিদ্ধান্ত নথিভুক্ত। রেফারেল নথিভুক্ত (সিমুলেশন)। | Reviewer decision recorded. Referral recorded (simulation). | D4_Design_Brief_V2.md:288 | Exact confirm-result copy, conditional on an actual recorded reviewer decision and simulated referral; not a generic closed-case note. Parent placement UNKNOWN (OQ-B1-2). |

## Reuse for authorised own fields

D1_PRD_V2.md:477 allows the parent's own scoped editable payload/status. D1_PRD_V2.md:421 (FR-030) and D1_PRD_V2.md:709 (TC-019) require candidate privacy. These keys are a reuse inventory, not permission to show every field in every status. No child values, transcripts or provider text belong in logs.

| key | bn | en | source (D3/D4/D1 line, or "new — needs human Bangla review") | used for (state/element) |
|---|---|---|---|---|
| `fieldName` | নাম | Name | src/locales/index.ts:98; src/locales/index.ts:278 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldAge` | বয়স | Age | src/locales/index.ts:99; src/locales/index.ts:279 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldSex` | ছেলে না মেয়ে | Boy or girl | src/locales/index.ts:100; src/locales/index.ts:280 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldClothing` | পোশাক | Clothing | src/locales/index.ts:101; src/locales/index.ts:281 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldMarks` | চেনার চিহ্ন | Identifying marks | src/locales/index.ts:102; src/locales/index.ts:282 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldLastSeenAt` | শেষবার কখন দেখা গিয়েছিল | When last seen | src/locales/index.ts:103; src/locales/index.ts:283 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldPlace` | কোথায় দেখা গিয়েছিল | Where last seen | src/locales/index.ts:104; src/locales/index.ts:284 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldDistrict` | জেলা | District | src/locales/index.ts:105; src/locales/index.ts:285 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldPhone` | আপনার মোবাইল নম্বর | Your mobile number | src/locales/index.ts:106; src/locales/index.ts:286 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldHeight` | উচ্চতা | Height | src/locales/index.ts:129; src/locales/index.ts:308 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldNameLatin` | নাম (ইংরেজি অক্ষরে) | Name (Latin letters) | src/locales/index.ts:130; src/locales/index.ts:309 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldThana` | থানা | Thana (police station area) | src/locales/index.ts:131; src/locales/index.ts:310 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldCircumstances` | কী ঘটেছিল (আপনার কথায়) | What happened (your words) | src/locales/index.ts:132; src/locales/index.ts:311 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `fieldRelation` | শিশুর সাথে আপনার সম্পর্ক | Your relation to the child | src/locales/index.ts:133; src/locales/index.ts:312 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `unknownValue` | অজানা | Unknown | src/locales/index.ts:97; src/locales/index.ts:277 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `sexMale` | ছেলে | Boy | src/locales/index.ts:92; src/locales/index.ts:272 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `sexFemale` | মেয়ে | Girl | src/locales/index.ts:93; src/locales/index.ts:273 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `sexOther` | অন্য কিছু | Other | src/locales/index.ts:94; src/locales/index.ts:274 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `sexUnknown` | জানি না | Don't know | src/locales/index.ts:95; src/locales/index.ts:275 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `ageYears` | {n} বছর | {n} years | src/locales/index.ts:107; src/locales/index.ts:287 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `ageRange` | {min}–{max} বছর | {min}–{max} years | src/locales/index.ts:108; src/locales/index.ts:288 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `heightCm` | {n} সেমি | {n} cm | src/locales/index.ts:134; src/locales/index.ts:313 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `approxTime` | আনুমানিক {t} | About {t} | src/locales/index.ts:109; src/locales/index.ts:289 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `timeWindow` | {from} থেকে {to}-এর মধ্যে (আনুমানিক) | Between {from} and {to} (approximate) | src/locales/index.ts:135; src/locales/index.ts:314 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `timeAfter` | {t}-এর পরে (আনুমানিক) | After {t} (approximate) | src/locales/index.ts:137; src/locales/index.ts:316 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |
| `timeBefore` | {t}-এর আগে (আনুমানিক) | Before {t} (approximate) | src/locales/index.ts:138; src/locales/index.ts:317 (reuse) | Own reviewed field label/value or formatter; available only in the authorised own-field view. |

## Implementation constraints for the handoff

- Parent screens: no red banners, countdowns or flashing (D4_Design_Brief_V2.md:43); errors use a neutral surface with icon (D4_Design_Brief_V2.md:224); successes use an inline teal check (D4_Design_Brief_V2.md:223).
- Status is icon + text + colour (D3_App_Flow_V2.md:146; D4_Design_Brief_V2.md:239). Controls have targets ≥ 44 × 44 px (D4_Design_Brief_V2.md:237). These are handoff requirements, not verified rendered properties.
- Bangla numerals on parent screens (D4_Design_Brief_V2.md:122): format numeric placeholders such as {s}, age, height and timestamp components before interpolation. Preserve an opaque reference identifier verbatim; its presentation is an open decision below, not permission to change its value. Unknown values use unknownValue; do not fabricate dates, versions, cooldowns or statuses.
- Edits require reviewed confirmation and expected_version. D1_PRD_V2.md:519 (BR-025) requires a new version, snapshot, voided pending pairs and reliable rematching; queueing does not establish completion. D1_PRD_V2.md:361–362 defines edit acceptance/lock behavior underlying TC-018 (D1_PRD_V2.md:708). No submitted child payload is stored before confirmation; providers may process only after notice and pre-submit server state is metadata only (D1_PRD_V2.md:474). This draft makes no runtime storage claim.
- Retain synthetic/simulation cues. Do not infer rescue, physical return, delivery, probability, alerts or legal compliance from a badge. Exact D4 limit/closure wording above describes limits; it makes no outcome promise. No network or provider calls are needed to use this draft.

## Open questions

- **OQ-B1-1 — Navigation and silent states: UNKNOWN.** D3_App_Flow_V2.md:140 sends editing toward S-003; final route/return behavior and the empty-state destination need the lead's implementation decision. D3 silent on skeleton announcement and edit-submitting copy: decide whether accessible loading text is needed, then draft and review it; no new loading state is asserted here.
- **OQ-B1-2 — Parent badge mapping and closure detail: UNKNOWN.** confirmed → parent badge: UNKNOWN. D1_PRD_V2.md:367 lists the parent labels but does not fully map internal states; D1_PRD_V2.md:491 is a district-count grouping, not authority for parent badge semantics. The lead must specify the mapping, any parent placement of the exact simulated-referral note, and whether closure reasons appear. D1_PRD_V2.md:409 permits coordination_recorded and resolved_outside_fera; a closed case alone does not establish a referral.
- **OQ-B1-3 — Submitted-session expiry recovery: UNKNOWN.** D3_App_Flow_V2.md:144 includes E-019, but D3_App_Flow_V2.md:333 describes an expired draft. D3_App_Flow_V2.md:317 distinguishes the parent cookie from the draft token; D1_PRD_V2.md:515 distinguishes their expiry periods. Decide recovery and honest submitted-session copy without implying that the submitted report was deleted or must be submitted again. startAgainAction applies only to the expired draft until that decision.
- **OQ-B1-4 — Offline retention and retry: UNKNOWN.** D3_App_Flow_V2.md:332 promises browser retention for a failed upload; it does not establish persistence for every status fetch/edit. Verify browser retention before using that exact saved-data string; decide separate copy for GET failure or unretained edits. No server-side draft persistence may be introduced.
- **OQ-B1-5 — Human Bangla review and reference presentation: UNKNOWN.** New strings need human Bangla review; reused draft keys retain any prior review debt. Decide how an opaque reference identifier is displayed with the Bangla numeral rule while preserving its exact lookup/copy value. Date, number, focus, icon, target-size and screen-reader behavior must be checked in the eventual UI; this Markdown cannot verify them.
