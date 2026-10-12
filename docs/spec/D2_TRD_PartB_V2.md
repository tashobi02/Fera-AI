# D2 — Technical Requirements Document — Fera — Part B (§10–§19)

| Field | Value |
|---|---|
| Version | 2.0 |
| Date | 11 Oct 2026 (Asia/Dhaka, UTC+6) |
| Owner | Sadman Shaharier (lead/integration) |
| Authors | Sadman Shaharier; Obidit Islam |
| Status | V2 team handover; implementation status UNVERIFIED |
| Split | Part A = §1–§9 (includes §7 schema). Part B = §10–§19. Companion `schema_v2.sql` is a byte-identical copy of Part A §7. |
| Inputs | D1 and D2 Part A V2.0; validation report; V2 evaluation, privacy, cost and release gates. |

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

V2 revises provider notices, pseudonymous redaction, append-only audit privileges, cost reservations, evaluation denominators and a single-database offline topology. Cached demos are excluded from quality results. Existing error IDs remain stable.

---

## 10 Security

### 10.1 Controls

| Area | V2 control |
|---|---|
| Input | Strict runtime schemas on body/query/provider output; NFC; source-span mapping; reject unknown keys and illegal kind/status pairs. |
| SQL | Parameterised queries; separate migration, runtime and redaction credentials; runtime never owns or alters tables. |
| Prompt | Text is data, no tools/URL fetching, constrained JSON and supported provenance. Substring presence alone does not validate a fact. |
| Audio | Tested WebM/MP4/WAV, actual size ≤2 MB and verified duration 5–120 s; codec-aware MIME parsing; Ogg only after verified support/transcoding. |
| Secrets | Server env, no public keys, no passwords in package; argon2id; secret scanning and committed lockfile. |
| Paid limits | Server-owned draft counters and HMAC-hashed network keys; atomic budget reservation before dispatch; fail closed for paid calls, keep manual forms available. |
| Logs | Allowlist request ID, operation/model, duration, costs, success and safe error ID. Never log bodies, transcript, provenance, provider raw errors, names, phones or free notes. |
| Audit | UPDATE/DELETE/TRUNCATE blocked; safe actor/resource/version/action only. Unknown resource FK null. Rejected transaction audit is written after rollback. |
| DTOs | Owner/staff-own/officer/admin allowlists; admin rematch returns status only; candidate details officer-only. |
| CSRF | Same-Origin for all state changes; JSON on standard routes and multipart on transcription; credential cookie and server expiry/revocation checks. |
| Headers | Test Next.js nonce/hash CSP with hydration/auth/map/poster. Bundled map baseline: self-only images. If OSM tiles enabled, allow canonical tile.openstreetmap.org and required attribution/Referer. |
| Referrer | Bundled map: no-referrer acceptable. OSM mode: origin-only compatible Referer policy, reviewed privacy notice. Do not suppress required Referer. |
| Demo access | DEMO_ONLY=true; restrict seeded privileged accounts and paid routes. DEMO_MODE fixtures are labelled and never enabled in quality evaluation. |
| Dependencies | Pinned lockfile, audit and deployment-specific checks; do not claim a dependency scan verifies the application. |

### 10.2 OWASP Top 10 (2021) check

| # | Item | Fera exposure | Control | Test |
|---|---|---|---|---|
| A01 | Broken Access Control | Parent or staff reading matched records | Server-side `requireRole`; SQL ownership filters; E-004 for hidden; `verified` read from DB | TC-022, TC-023 |
| A02 | Cryptographic Failures | Phones and names in transit or at rest | HTTPS only; managed DB encryption at rest (host-dependent, OQ-021); argon2id passwords; HMAC-signed cookies | Header check in TC-033 run |
| A03 | Injection | SQL; prompt injection via report or import text | Parameterised SQL; data-only prompt framing; schema-only output; evidence check | TC-030, TC-014 |
| A04 | Insecure Design | AI auto-confirming matches; alert issuance | No code path from AI to state change; BR-001; no alert feature | TC-010, TC-025 |
| A05 | Security Misconfiguration | Debug output, permissive CORS | No CORS (same origin); errors without stack traces; `DEMO_ONLY=true`; protected fixture mode enabled only for labelled demo runs | Manual config review |
| A06 | Vulnerable and Outdated Components | npm supply chain | Lockfile; `npm audit`; pinned major versions | CI audit step |
| A07 | Identification and Authentication Failures | Weak passwords; session theft | Min 10 chars; argon2id; httpOnly Secure cookies; 8 h expiry; brute-force limit | TC-023 |
| A08 | Software and Data Integrity Failures | Tampered draft token; altered audit | HMAC draft token; append-only audit trigger | TC-016 |
| A09 | Security Logging and Monitoring Failures | Undetected misuse | Audit of decisions and denied access; pino logs with request IDs | TC-016, TC-022 |
| A10 | Server-Side Request Forgery | `source_url` on import | URLs stored only, never fetched by the server | Code review; TC-014 |

---

## 11 Privacy, retention and pilot gate

Only invented synthetic records are permitted in V2. Public availability does not remove a child's privacy interests; real news/alert imports remain outside this release.

| System/data | V2 treatment | Real-case gate |
|---|---|---|
| Child case fields | Reviewed fields only; no photos, ID documents or precise coordinates | Partner-defined minimisation and lawful basis |
| Before submit | Payload stays on device; server metadata only | Consent/authority and device threat review |
| Provider audio/text | Synthetic only, with processing notice before recording/sending | Account/endpoint retention, training, processor and transfer review |
| Draft storage | Clear on submit/discard; check 24-hour expiry on access; clear-device control | Do not promise physical removal while browser is closed |
| Audio | In-memory/transit only; not in localStorage or DB | Endpoint terms, actual retention and incident duties |
| Redaction | Direct identifiers, exact age, source URL, owner/hash/provenance/vector metadata, outcome/referral/decision/candidate notes, snapshots and outputs cleared | Field-specific retention and correction/evidence requirements |
| Retained record | IDs, age band, sex, district, dates/status and safe audit links under access control | Pseudonymisation; residual linkage/re-identification risk assessment |
| Found evidence | Redact only after linked missing case is closed | Partner evidence-preservation/correction window |
| External copies | Downloads, provider copies and backups follow separate policy | Withdrawal/deletion propagation and backup expiry |
| Map requests | Bundled geometry baseline; optional tiles disclose viewport/request metadata and IP | Approved provider/policy and privacy notice |
| Poster export | Preview phone/place/age, choose contact inclusion, acknowledge public sharing and no remote recall | Appropriate authority and safer institutional contact |
| Access | Own scoped views; operational verified-officer evidence; admin metadata | Real officer onboarding, assignment/supervision and revocation |

The checkbox “আমি যাচাই করেছি” verifies accuracy, not legal guardianship. “Nothing shared before confirm” means no submitted-register/candidate sharing; provider processing happens earlier and is disclosed. Retention duration and receiving agency remain partner decisions; they are not invented defaults.

The official Personal Data Protection Act, 2026 is Act 63, dated 10 April 2026, with phased commencement. Its child-data and transfer provisions require qualified assessment before real-case use. Accurate sourced legal references are allowed; the product makes no compliance claim. [Official law](https://bdlaws.minlaw.gov.bd/act-1692.html).

Unpaid Gemini service terms permit improvement/human review uses and caution against personal/sensitive input. OpenAI data treatment varies by endpoint and settings. “No training” is not a universal zero-retention promise. Verify the exact account, model, endpoint and fallback, using [Gemini terms](https://ai.google.dev/gemini-api/terms) and [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data). Only synthetic data is allowed until a future release passes the pilot gate.

Before a pilot: responsible agency; approved identity/guardian/safeguarding checks; authorised consent/lawful basis; legal/provider/transfer review; verified onboarding; referral acknowledgement; correction/reopen procedure; retention schedule; access review; breach response; backup/restore test; operational staffing. A data agreement alone does not establish safe operation or national scale.

---

## 12 Performance targets and AI budget

### 12.1 Performance

| Target | Value | Measured by |
|---|---|---|
| Parent intake first load, mid-range Android, 4G | LCP ≤ 3 s; route JS ≤ 170 KB gzip | Lighthouse mobile profile, 3 runs median |
| Non-AI API p95 | ≤ 500 ms (case read, queue, decision, stats) | Playwright timing + server logs |
| Transcription, 120 s note | ≤ 20 s p95 (NFR-003) | `ai_calls.duration_ms` |
| Extraction | ≤ 15 s p95 (NFR-002) | `ai_calls.duration_ms` |
| Voice note (60 s) → draft shown | ≤ 35 s p95 end to end | E2E timer |
| Matching, one case vs 500 records | ≤ 5 s (NFR-004); target ≤ 1 s on 200 | `eval/perf.ts` |
| Map stats, 1,000 cases | ≤ 2 s (NFR-005) | `eval/perf.ts` |
| Concurrent demo users | 10 realistic; 50 design (A-020) | k6-style script `eval/load.ts`, error rate < 1 % |

### 12.2 AI usage estimate against USD 30

Provider prices are not in any source: UNKNOWN (OQ-004, OQ-022). The plan below fixes usage volumes and the maximum unit price the budget allows.

| Use | Speech (min) | Extraction calls | Basis (Assumption A-037) |
|---|---|---|---|
| Development and testing | 60 | 300 | 3 devs, 9–13 Oct |
| WER evaluation | 90 | 0 | 60 unique clips × 30 s × 3 repeated runs; repeats are not new independent samples |
| Extraction evaluation | 0 | 220 | 50 reports × 4 runs × 1.1 retries |
| Matching evaluation (extracted-field mode) | 0 | 400 | 200 records × 2 runs |
| Public import | 0 | 50 | Should only |
| Timing study + rehearsals + video + finale | 40 | 130 | 5 testers, 10 rehearsals, 3 takes |
| **Total** | **190 min** | **1,100 calls** | |

| Cost line | Allocation | Max unit price that fits |
|---|---|---|
| Speech | USD 5 | ≤ USD 0.026 per audio minute |
| Extraction (≈ 1,200 input + 400 output tokens per call → 1.32 M in, 0.44 M out) | USD 15 | ≤ USD 4.87 per 1 M input-equivalent tokens, counting output at 4 × input |
| Embeddings | USD 0 | Local model (DECISION-006) |
| Reserve | USD 10 | Re-runs, API embeddings if RISK-015 fires |
| **Total** | **USD 30** | Atomic reservation stop at USD 25; raising toward the USD 30 ceiling requires a documented team budget decision |

Rule: at the 11 Oct contract gate, Obidit records real prices from provider pages in `docs/costs.md`. If prices exceed allocation, reduce repeated runs or optional import, retain independent sample coverage and failure reporting, and recalculate actual input/output rates separately. 1.32 + 4×0.44 = 3.08M input-equivalent tokens; 15/3.08 = USD 4.87/M. A reservation upper bound covers maximum tokens/duration; uncertain calls are not refunded silently.

---

## 13 Error catalogue

| ID | Key | User message (Bangla / English) | Developer log | Recovery |
|---|---|---|---|---|
| E-001 | VALIDATION_FAILED | কিছু তথ্য ঠিক নেই। চিহ্নিত ঘরগুলো দেখুন। / Some details need fixing. Check the marked fields. | `warn` route, Zod issue paths | Highlight fields; keep input |
| E-002 | UNAUTHENTICATED | আবার সাইন ইন করুন। / Please sign in again. | `info` route | Redirect to SCREEN-008, return after |
| E-003 | FORBIDDEN_ACTION | এই কাজের অনুমতি আপনার নেই। / You don't have permission for this action. | `warn` user ID, role, route | Show SCREEN-016 |
| E-004 | NOT_FOUND | তথ্যটি পাওয়া যায়নি। / We couldn't find that. | `warn` + `access.denied` audit if signed in | SCREEN-016 with link home |
| E-005 | ILLEGAL_TRANSITION | কেসটির অবস্থা বদলে গেছে। পাতাটি আবার খুলুন। / This case has changed. Reload the page. | `warn` from→to, case ID | Reload latest state |
| E-006 | SUBMISSION_PAYLOAD_CONFLICT | এই জমা নম্বরের তথ্য বদলেছে। তথ্য যাচাই করে আবার জমা দিন। / This submission key has different details. Review before submitting again. | `warn` safe request/key conflict, no payload | Preserve draft; review new submission action |
| E-007 | RATE_LIMITED | {s} সেকেন্ড পরে আবার চেষ্টা করুন। / Please try again in {s} seconds. | `warn` key, count | Countdown, then enable button |
| E-008 | AUDIO_TOO_LARGE | রেকর্ডিং অনেক বড়। ২ মিনিটের কম রেকর্ড করুন। / The recording is too large. Keep it under 2 minutes. | `info` bytes | Re-record or type |
| E-009 | AUDIO_LENGTH_OUT_OF_RANGE | রেকর্ডিং ৫ সেকেন্ড থেকে ২ মিনিটের মধ্যে হতে হবে। / Recordings must be 5 seconds to 2 minutes. | `info` duration | Re-record |
| E-010 | SPEECH_UNINTELLIGIBLE | কথাগুলো পরিষ্কার শোনা যায়নি। আবার বলুন বা লিখে দিন। / We couldn't hear that clearly. Try again or type instead. | `info` transcript length, script ratio | Re-record or focus text box |
| E-011 | SPEECH_UNAVAILABLE | এখন ভয়েস কাজ করছে না। লিখে জানান। / Voice isn't working right now. Please type. | `error` provider, status | Text path |
| E-012 | LLM_INVALID_OUTPUT | সহকারী তথ্য গুছাতে পারেনি। নিচের ফর্মটি পূরণ করুন — আপনার লেখা রাখা আছে। / The assistant couldn't organise this. Please fill the form — your text is kept. | `error` provider, Zod issues (no text) | SCREEN-005 pre-filled |
| E-013 | LLM_UNAVAILABLE | সহকারী এখন সাড়া দিচ্ছে না। ফর্মে তথ্য দিন। / The assistant isn't responding. Please use the form. | `error` both providers, status | SCREEN-005 |
| E-014 | AI_TIMEOUT | অনেক সময় লাগছে। আবার চেষ্টা করুন বা ফর্ম ব্যবহার করুন। / This is taking too long. Try again or use the form. | `warn` operation, 25 s | Retry once, then SCREEN-005 |
| E-015 | UNSUPPORTED_LANGUAGE | বাংলা বা ইংরেজিতে বলুন বা লিখুন। / Please speak or write in Bangla or English. | `info` script ratios | Re-enter |
| E-016 | OUTPUT_BLOCKED | এই লেখাটি তৈরি করা যায়নি। আবার চেষ্টা করুন। / We couldn't create this text. Please try again. | `error` output type, matched term ID | Regenerate; report to team |
| E-017 | REFERRAL_REQUIRED | রেফারেল ছাড়া কেস বন্ধ করা যাবে না। / A referral is needed before closing. | `warn` case ID | Confirm a match first |
| E-018 | EDIT_LOCKED | মিল নিশ্চিত হওয়ার পর কেস বদলানো যায় না। / This case can't be edited after a match is confirmed. | `info` case ID, status | Use the stated case-support process; 13219 remains the external MUN helpline, not a direct Fera-officer contact |
| E-019 | SESSION_EXPIRED | আপনার খসড়ার সময় শেষ। নতুন করে শুরু করুন। / Your draft has expired. Please start again. | `info` session age | Start new intake |
| E-020 | OUTPUT_REQUEST_LIMIT_RESERVED | Reserved for future output-abuse limits; not an active V2 regeneration counter. Identical current-version templates are reused. | Safe rate-limit metadata only | Reuse current output; no five-generation rule |
| E-021 | INTERNAL | কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন। / Something went wrong. Please try again. | `error` stack (server only), request ID | Retry; draft kept |
| E-022 | MIC_UNAVAILABLE | মাইক্রোফোন চালু করা যায়নি। আপনি লিখে জানাতে পারেন। / The microphone isn't available. You can type instead. | client `console.warn` only | Focus text box |
| E-023 | AI_BUDGET_CAP | সহকারীর সীমা শেষ। বাকি তথ্য ফর্মে দিন। / The assistant's limit is reached. Add the rest in the form. | `warn` calls used or spend total | SCREEN-005 |
| E-024 | NETWORK_OFFLINE | ইন্টারনেট সংযোগ নেই। আপনার তথ্য রাখা আছে — সংযোগ ফিরলে আবার পাঠান। / No internet connection. Your details are saved — send again when you're back online. | client only | Retry button; draft kept in browser |

---

## 14 Observability

| Item | Specification |
|---|---|
| Logs | pino JSON to stdout: `time`, `level`, `request_id`, `route`, `role`, `status`, `duration_ms`, `error_id`. PII redacted (§10.1). |
| AI metrics | One `ai_calls` row per call: operation, provider, model, duration, units, estimated cost, cache hit, error ID. |
| Spend report | `npm run spend` prints today's and total spend vs `AI_SPEND_CAP_USD`. Run daily (TASK-059). |
| Health | API-019 `/api/health`: DB ping, embedding model loaded, demo mode flag, git SHA. |
| Debug mode | Verified officers may inspect safe matching components on SCREEN-010; admins receive request/model/cache operational metadata only, never candidates, scores or child payload. Debug does not bypass DTO/role checks. |
| Demo-safe fallback | `DEMO_MODE=1` loads `/fixtures/demo/*.json` (transcripts, extraction outputs and embeddings for 3 scripted cases). Lookup key: SHA-256 of normalised text, or `fixture_id` for the 3 scripted audio files. Any cached result shows a small "ক্যাশ" (cached) badge so judges are never misled. |
| Alerts | None automated. Lead checks `/api/health` and `npm run spend` before each demo. |

---

## 15 Deployment

### 15.1 Environment variables

| Name | Example | Required |
|---|---|---|
| `DATABASE_URL` | `postgres://fera:…@host:5432/fera?sslmode=require` | ✓ |
| `AUTH_SECRET` | 32+ random bytes, base64 | ✓ |
| `PARENT_COOKIE_KEY`, `DRAFT_SIGNING_KEY` | 32+ random bytes each | ✓ |
| `LLM_PROVIDER`, `LLM_MODEL` | `gemini` + model ID from OQ-004 | ✓ |
| `LLM_FALLBACK_PROVIDER`, `LLM_FALLBACK_MODEL` | second provider | ✓ |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | as held | per provider |
| `STT_PROVIDER`, `STT_MODEL` | `whisper` + model ID | ✓ |
| `EMBED_PROVIDER`, `EMBED_MODEL`, `EMBED_CACHE_DIR` | `local`, candidate model, `./models` | ✓ |
| `AI_SPEND_CAP_USD` | `25` | ✓ |
| `DEMO_ONLY` | `true`; blocks real-case intake | ✓ |
| `DEMO_MODE` | `0` for quality evaluation; `1` only for labelled scripted fixtures | ✓ |
| `SEED_ADMIN_USER`, `SEED_ADMIN_PASSWORD` | for seeding only | seed |

### 15.2 Local setup (≤ 15 min working target, NFR-014)

The following commands are an implementation target, not delivered application code. The handover contains specification companions only. Apply the schema to a fresh isolated DB; define the npm scripts and README in the actual repository, then test setup time.

```bash
git clone <repo> fera && cd fera
cp .env.example .env.local            # fill keys
docker compose up -d db               # postgres 16 + pgvector image (pin and verify exact image/extension versions at contract gate)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f code/schema_v2.sql
npm ci
npm run model:fetch                   # downloads embedding model to ./models
npm run seed -- --set demo            # districts, neighbours, users, ~200 synthetic records
npm run dev                           # http://localhost:3000
```

### 15.3 Build and deploy

| Step | Command / action |
|---|---|
| Check | `npm run lint && npm run typecheck && npm test` |
| Build | `npm run build` |
| Deploy (Round 2) | Push to `main` → Vercel production deploy. Preview deploy per pull request. |
| Database | Apply `schema_v2.sql` once on the managed host; seed with `npm run seed -- --set demo` using the production URL. |
| Smoke test | `npm run smoke -- --base https://<prod-url>` (health, sign-in, one extract, map stats) |
| Finale laptop | `DEMO_MODE=1 npm run build && npm start`; local DB seeded; phone uses the deployed HTTPS URL over mobile data (A-031). |

### 15.4 Rollback

| Layer | Method |
|---|---|
| App | Re-deploy the previous green commit; tag `r2-freeze` on 14 Oct and `finale` on 23 Oct. |
| Schema | `schema_v2.sql` is version 1.0 only. Any change ships as `migrations/NNN_*.sql` with a matching down script. |
| Data | `npm run seed -- --reset --set demo` restores demo data in < 2 min. |

### 15.5 Seed and demo data

| Set | Contents |
|---|---|
| `districts` | 64 rows with Bangla/English names and centroids (DEP-004) |
| `neighbours` | Team-compiled adjacency (A-013) |
| `users` | 1 admin, 2 verified officers, 1 unverified officer, 2 staff — seeded passwords from env |
| `synthetic` | ~200 records, all `is_synthetic=true`, incl. 3 named demo cases (D6 §9) |
| `fixtures/demo` | Cached outputs for the 3 scripted inputs |

---

## 16 Trade-offs

| Decision | Alternatives | Reason | Cost | Migration path |
|---|---|---|---|---|
| DECISION-004 LLM adapter, extraction only | Single vendor SDK throughout | No lock-in; fallback on outage; pick best Bangla extractor after eval | ~4 h extra code; 3 prompt variants to test | Add a provider class; set env |
| DECISION-002 pgvector in Postgres | Separate vector DB service | One store, one backup, transactional with case state; 200–30,000 rows is small | HNSW tuning limited; vector search shares DB CPU | Export embeddings; swap COMP-012 query layer |
| DECISION-008 Embeddings + rules | Pure LLM pairwise judging | Deterministic, explainable, offline, ~0 cost; LLM over 200×200 pairs breaks budget and NFR-004 | Misses some semantic nuance | Add an optional LLM re-rank of top 5 behind a flag |
| DECISION-006 Local embeddings | API embeddings | Free, offline for finale | Model size/cold start risk (RISK-015) | `EMBED_PROVIDER=api` + `npm run reembed` |
| DECISION-007 Template outputs | LLM-written GD, poster, reasons | Cannot add facts (BR-022); offline; 0 calls | Less natural wording | Add LLM "polish" behind flag with fact-diff check |
| DECISION-010 Deployed app + local copy | Deployed only | Venue Wi-Fi risk | Two environments to seed | Single env after the hackathon |
| DECISION-016 Dev/test split for matching evaluation | Tune and score on the same set | Avoids inflated metrics (RISK-007) | Smaller test set | Larger set later |
| DECISION-017 Hard spend cap in app | Watch provider dashboards only | Budget is fixed at USD 30 | One table + one check | Raise cap via env |

---

## 17 Evaluation design and reporting

| Metric | Set | Definition | Script |
|---|---|---|---|
| Extraction GOAL-002 | 50 unique labelled reports; identity/variant-grouped dev/test; exact source spans | Present-field accuracy, false additions/omissions, per-field precision/recall; null agreement reported separately, never headline accuracy. Phone exact, exact time tolerance separate from approximate interval correctness. | eval:extract |
| Matching GOAL-003 | Manifest: 80 missing + 80 found + 40 additional decoys = 200 total; 60 canonical true pairs, 20 canonical no-match missing queries; 25 duplicate relationships within the same 200 | Identity/duplicate-connected-group split 40% dev/60% test; all variants stay together. Hit/Recall@5 on true-pair queries; top-1 accuracy and coverage; query-level P@5 and separately named aggregate shortlist precision. | eval:match |
| No-match and uncertainty | Include unknown age, overlapping times, shared contacts, wrong district, similar names and contradictions | Report false-candidate/above-threshold suggestion rates, abstention coverage, true-pair misses; minimum qualification threshold frozen on dev. | eval:match |
| Duplicates GOAL-004 | 25 declared same-identity duplicate links; explicit different-child shared-phone negatives | Pairwise precision/recall/F1 plus false consolidation/hiding count. Detection only; no claimed merge accuracy. | eval:dedupe |
| Speech GOAL-005 | 20 prompts × 3+ speakers = 60 unique clips; noise/dialect/Banglish slices; repeated runs labelled | WER=(S+D+I)/N may exceed 100%; tokenisation documented; unique count distinct from repeats; phone/age/place/time errors and speech→extraction errors. | eval:wer |
| Timing GOAL-001 | 5+ adult volunteers, invented scenarios, paired/counterbalanced methods | Median/range and completion numerator/denominator; help and order effects recorded; five-person 90% threshold requires 5/5. Exploratory, not population efficacy. | eval:time |
| Human/audit GOAL-008 | Known seeded lifecycle plus concurrent and denied actions | Every terminal coordination event has a verified recorded decision where needed and a safe audit; identity verification is not inferred. | eval:audit |


Manifest fields: record_id, kind, identity_id, duplicate_group_id, true_partner_ids, no_match, decoy_type, source_variant, split, speaker_id where applicable, and ground_truth_revision. Assert total=200 and declared link/query counts. The 40 decoys are additional to the 160 canonical reports; duplicate variants/links are included within the 200, not an extra uncounted set. Group splitting may alter the exact 40/60 count: report actual counts rather than force identity leakage. Validate an independent test manifest before any tuning.

Ground truth is written and hashed before matcher tuning. Tune prompts/weights/thresholds only on dev. Freeze model revision, preprocessing, embedding space, score components, qualification/dedupe thresholds, prompt/template hashes, and goals before held-out runs. Evaluation enforces DEMO_MODE=0 and cache_hit=false; a fixture hit invalidates the relevant quality run.

Baselines: manual form timing; rules-only extraction where feasible; rules-only matching; embeddings-only and combined ranking. Run gold-field and speech/extracted-field modes. Separate live AI latency/spend from cached demo timing. Record model/account mode, sample/query count, SHA, date, hardware/deploy, denominators, uncertainty and at least two failures. Approximately 36 true-pair queries may remain from 60 pairs at a 60% split; do not claim national accuracy from this small synthetic test.

Synthetic record text, outcome labels and fixture names do not imply successful rescue or operational officer adoption. If a promised metric cannot be measured, show “not measured” with reason and next action; never a target as an achieved value.

---

## 18 Technical acceptance criteria

| # | Criterion | Check |
|---|---|---|
| 1 | Every Must FR passes its TC on the protected synthetic deployment; unmet items are disclosed and block the claimed feature. | Playwright run report |
| 2 | `schema_v2.sql` applies cleanly to an empty Postgres 16 + pgvector database. | CI job |
| 3 | Illegal state transitions fail at the DB trigger even when called directly. | TC-032 |
| 4 | `audit_log` UPDATE, DELETE and TRUNCATE fail; runtime role cannot alter/disable protections. | TC-016 |
| 5 | Parent/staff responses contain no candidates or other-party found-case fields; staff own-entry and parent own-edit DTOs are tested. | TC-019, TC-022 |
| 6 | Logs from a full E2E run contain 0 phone numbers and 0 child names (regex scan). | TC-028 |
| 7 | Scripted journey completes with network disabled in `DEMO_MODE=1`. | TC-021 |
| 8 | `npm audit --omit=dev`: 0 high/critical. | CI |
| 9 | axe plus manual keyboard, Bangla screen reader, short-cut disabling, 320px reflow/400% viewport and 200% text zoom; no unresolved AA issue in required flows. | TC-033 |
| 10 | Atomic cap defaults USD 25; any reviewed increase stays ≤ USD 30; reservations and actual settled spend are reported. | `npm run spend` |
| 11 | All §12.1 targets met or the miss reported in the deck. | `eval/perf.ts` |
| 12 | Evaluation report contains all 5 deck metrics with failure examples. | TC-020 |

---

## 19 Engineering task breakdown

TASK IDs, owners, dependencies and done criteria are in D6 §5. The full board totals 222 h; the specified Round 2 subset totals 184 h. Actual remaining effort requires a completed-work inventory.

| Area | TASKs | Hours |
|---|---|---|
| Setup and spikes | TASK-001 – TASK-005 | 11 |
| Frontend | TASK-008, TASK-021, TASK-022, TASK-024, TASK-025, TASK-026, TASK-027, TASK-028, TASK-029, TASK-030, TASK-031, TASK-032 | 47 |
| Backend | TASK-006, TASK-007, TASK-015, TASK-020, TASK-023, TASK-059 | 24 |
| Database and data | TASK-009, TASK-010, TASK-011, TASK-019 | 16 |
| AI pipeline | TASK-012, TASK-013, TASK-014, TASK-016, TASK-017, TASK-018, TASK-033 | 31 |
| Integration and polish | TASK-034, TASK-035, TASK-036 | 8 |
| Testing and evaluation | TASK-037 – TASK-041, TASK-043, TASK-060 | 24 |
| Deployment | TASK-042, TASK-053 | 6 |
| Demo and submission | TASK-044, TASK-045, TASK-046, TASK-054, TASK-055, TASK-058 | 20 |
| Should / Could | TASK-047 – TASK-052, TASK-056, TASK-057 | 23 |
| V2 contract, schema, budget and manifest remediation | TASK-061 – TASK-064 | 12 |
| **All tasks** | **64 tasks; full task-board estimate** | **222** |

---

## Assumptions (Part B)

| ID | Assumption |
|---|---|
| A-037 | Usage volumes in §12.2 (190 audio minutes, 1,100 extraction calls, ~1,200 input + 400 output tokens per call). |
| A-038 | Output tokens cost about 4 × input tokens for budgeting; replace with verified real prices at the 11 Oct contract gate. |
| A-039 | The canonical manifest totals 200 reports: 80 missing + 80 found + 40 decoys; 60 canonical true pairs, 20 no-match missing queries and 25 duplicate links within that same total. |

## IDs introduced

- E-024 NETWORK_OFFLINE (client only)
- DECISION-016 Dev/test split for matching evaluation
- DECISION-017 Hard AI spend cap in app
- A-037 AI usage volumes
- A-038 Output/input token price ratio
- A-039 Synthetic set composition

## IDs referenced

- E-001 – E-023, DECISION-002, DECISION-004, DECISION-006 – DECISION-008, DECISION-010, API-019, COMP-012, COMP-021 (D2 Part A)
- FR-025, BR-001, BR-006, BR-011, BR-022, NFR-002 – NFR-005, NFR-014, NFR-016, A-010 – A-013, A-020, A-031 (D1, D2 Part A)
- GOAL-001 – GOAL-005, GOAL-008 (00)
- OQ-004, OQ-011 – OQ-013, OQ-021, OQ-022 (00, D1, D2 Part A)
- RISK-007, RISK-015 (D1, D2 Part A)
- DEP-004 (D1)
- SCREEN-005, SCREEN-008, SCREEN-010, SCREEN-016 (D1)
- TC-010, TC-014, TC-016, TC-019 – TC-023, TC-025, TC-028, TC-030, TC-032, TC-033 (D1)
- TASK-001 – TASK-060 (D6)
