Last run: 2026-10-18T14:58:17.388Z — 5 run(s) (AUTOMATED) — all green

# Pre-main test-journeys — automated offline rehearsal evidence

Date (UTC): 2026-10-18
Lane: `pre-main-test-journeys` (worker-isolated; coordinator owns Git)
Scope: tests/e2e/** (existing; inspection only), playwright.offline.config.ts (new), scripts/rehearsal/** (new), tests/rehearsal/** (new), docs/execution/evidence/pre-main-test-journeys.md (this file)

## What this lane delivered

1. **New offline Playwright config** — `playwright.offline.config.ts`
   * Port: `3225` (existing `playwright.config.ts` keeps port `3100`)
   * Dedicated loopback DB prefix: `fera_e2e_premainjourney_<pid>_<hex>`
   * Single Next.js instance per run (`workers: 1`, `reuseExistingServer: false`)
   * `DEMO_MODE=1`; `FERA_MODEL_CACHE` pinned to `/home/obidit/secondBrain/coding/Fera-AI/.worktrees/phase3-finish/.cache/models`
   * Loopback guard reused from `scripts/db/guard.mjs`; existing `playwright.config.ts` is **not modified**

2. **New offline log wrapper** — `scripts/rehearsal/launch-offline-server.mjs`
   * Mirrors `scripts/e2e-server.mjs` (not modified); reads `FERA_REHEARSAL_LOG_PATH`
   * Per-run log: `.e2e-logs/fera_rehearsal_<pid>_<hex>.log` (gitignored)
   * Refuses to start without `DEMO_MODE=1` and `FERA_MODEL_CACHE` set

3. **Network watchdog** — `tests/rehearsal/network-watchdog.ts`
   * Installs `context.addInitScript` that pins `navigator.onLine` to `false` and swallows any `online` event the app or a library tries to dispatch — the app's own client-side offline guards run their offline branch even though the test webServer is actually serving on loopback (the brief: "initScript overriding navigator.onLine=false")
   * Installs `context.route` handler that ABORTS every non-loopback request
   * Loopback allowlist: `127.0.0.1`, `localhost`, `::1`; non-http schemes `data:`, `blob:`, `about:`, `chrome*` are passed through
   * Records every URL the browser attempts: host, scheme, method, resource type, port, decision (allow/deny/pass), outcome, time
   * Exposes `assertNoExternalAttempts` and `summarize` for the spec

4. **Full single-DB offline journey** — `tests/rehearsal/full-journey-offline.spec.ts`
   * Journey 1: parent manual review → confirm → status → edit (BR-004, FR-026, FR-030)
   * Journey 2: staff found-log form → POST API-007 (TC-008)
   * Journey 3: officer queue reject + fresh candidate confirm (TC-010/011, BR-005/019/020) — 4-checkbox UI dialog
   * Journey 4: officer case close + dashboard count map (TC-010/011, FR-021, BR-022)
   * Journey 5: officer duplicates: profile vs phone-only (BR-017/018, FR-020)
   * Journey 6: admin synthetic import via API-015 (FR-024, TC-014)
   * Journey 7: cache positive extraction — exact `EXTRACT_FIXTURE_SOURCE` → `cached: true`, zero paid calls (BR-026, TC-021/056)
   * Journey 8: outputs — GD draft, poster share, 13219 helpline summary (TC-006, FR-008/009/010)
   * Journey 9: voice recorder — synthetic `MediaRecorder` bytes path or honest "missing live voice" (TC-021, FR-027/032, BR-026)
   * Suite-level: offline network assertion + cache + log evidence
   * Suite-level: offline survival — OWNED second server (different port, same DB, same cache, same signing keys) re-reads the DB and audit chain after a real restart

5. **Inspection of the 78 existing e2e tests** — `scripts/rehearsal/inspect-existing-checks.mjs`
   * Static analyzer; reports `docs/execution/evidence/pre-main-test-journeys-inspection.json`
   * 27 top-level `test()` invocations across 9 spec files expand to **78 expanded test instances** under two projects (mobile + desktop) — same number Playwright reports from `playwright.config.ts --list`
   * 4 `toBeTruthy()` patterns flagged (officer-lifecycle: 2, parent-journey: 2) — these are server-acknowledgement booleans paired with explicit string checks elsewhere; not UI-string assertions
   * No `route.fulfill`, no `route.continue` body overrides, no `addInitScript` auth bypass, no `test.skip` / `test.fixme` on UNVERIFIED paths
   * Notes (each justified, no false claim of UI):
     * `parent-journey.spec.ts` uses `/api/cases` POST to assert "no server case row before confirm" (BR-004); followed by a real-browser journey on the same form
     * `officer-lifecycle.spec.ts` uses API-010 for the reject/confirm wire shape and the real UI for the 4-checkbox dialog — split is intentional
     * `safeguarding.spec.ts` `addInitScript` / `deskContext` / `signInDesk` set the same-origin header the route's same-origin check requires; no auth bypass
     * `log-scan.spec.ts` uses `/api/health` (API-019), a public no-auth endpoint; the unique marker is in the URL query string
     * `smoke-mutation.spec.ts` uses `scripts/smoke.mjs` with the loopback baseURL; the script does its own loopback check before any mutation
     * `a11y.spec.ts` uses keyboard traversal via Tab; explicitly does **not** claim physical device or 400 % browser zoom (the 200 % root-scale injection is documented and the 320 CSS px viewport reflow check is the actual assertion)

6. **AUTOMATED 5-repeat runner** — `scripts/rehearsal/run-automated-repeats.mjs` (+ `runner-helpers.mjs`)
   * Default `--runs 5`; --runs must be a positive integer (1–50); unknown flags are refused
   * Each repeat is a fresh webServer lifecycle (per-run DB prefix, per-run log)
   * Per-run network records: `docs/execution/evidence/pre-main-test-journeys-records.run<N>.json`
   * Per-run raw logs: `docs/execution/evidence/pre-main-test-journeys-logs/run<N>.log`
   * Default teardown drops ONLY the fresh owned `fera_e2e_premainjourney_*` DB the run created; `--no-cleanup` opt-out; never a human/demo/shared DB
   * Pure helpers (parseArgs, parseRuns, replaceSection, dropRehearsalDb, …) are unit-tested in `tests/rehearsal/runner-helpers.test.ts` (20 tests)

## Ownership boundary

This worker OWNS only:
- `tests/e2e/**` (read-only inspection, no modifications)
- `playwright.offline.config.ts` (new)
- `scripts/rehearsal/**` (new)
- `tests/rehearsal/**` (new)
- `docs/execution/evidence/pre-main-test-journeys.md` (this file)

This worker does NOT modify:
- `playwright.config.ts` (Sadman / P3-014)
- `scripts/e2e-server.mjs` (Sadman / P3-014)
- `src/**` (any owner)
- `package.json` (any owner)
- `db/**` (Sadman / P1-002)
- `next.config.ts` (any owner)
- `node_modules` symlink (worktree setup, owned by coordinator)

## Honest labels and honest evidence

* **Cached voice**: `TRANSCRIPT_FIXTURES` in `src/server/cache/fixtures.ts` is `Object.freeze([])` in this build. Journey 9 installs a clearly-synthetic `MediaRecorder` stand-in (header bytes `"MOCK"`, 4 KiB payload), drives the page's start/stop control, and asserts the synthetic SHA is NOT in `TRANSCRIPT_FIXTURES`. The page cannot produce a fake "cached: true" because the hash check fails. **No transcript is invented.**
* **Cache positive extraction** (NEW, Journey 7): posts the exact `EXTRACT_FIXTURE_SOURCE`; asserts `cached: true`, `ai_calls_used: 0`, and that the `cases` and `ai_reservations` tables do NOT grow on the cache hit. Pins the navigator-offline/cached-badge path the brief calls out as "not proven".
* **No latency claim**: the suite does not claim that a request is fast. The recorded `at` is the wall-clock time at the moment the route handler decided, not a duration.
* **No physical-device claim**: the rehearsal uses the Playwright desktop project; it does not claim a physical mobile or 400 % browser zoom.
* **No provider call**: every run uses `DEMO_MODE=1` and the on-disk pinned model cache; the embedder never reaches the network.
* **No reset of an existing DB**: the dedicated `fera_e2e_premainjourney_<pid>_<hex>` prefix is the only target; human/demo/shared DBs are untouched.
* **Real server restart** (survival test): the test spawns an OWNED second `next start` on a different port with the same DB URL, same `FERA_MODEL_CACHE`, and same throwaway signing keys as the first webServer. The first webServer (owned by Playwright) is NEVER killed; the second is SIGTERMed by the test. The post-restart DB counts, audit counts, and the closed case from Journey 4 are re-asserted, and the second server's `/api/health` is probed.
* **No edits to `git`, `main`, `secrets`, or `host settings`**: the wrapper inherits the process env and never reads or writes `.env*`.

## How to run (rehearsal only — coordinator decides merge)

```sh
# Single run (default workers=1, port 3225, dedicated DB prefix).
npx playwright test --config=playwright.offline.config.ts

# Five automated repeats (appends run-by-run rows to this file).
node scripts/rehearsal/run-automated-repeats.mjs --runs 5
```

Each run mints a fresh DB name (`fera_e2e_premainjourney_<pid>_<hex>`) and a fresh log path (`.e2e-logs/fera_rehearsal_<pid>_<hex>.log`).

## Status evidence (commands run in this tree)

| Command | Exit | Notes |
|---------|-----:|-------|
| `npx tsc --noEmit --project .` | 0 | All TS clean (existing 78 + new 11 tests + 31 unit tests compile) |
| `npx eslint tests/rehearsal/ playwright.offline.config.ts scripts/rehearsal/` | 0 | 0 errors, 0 warnings |
| `npx vitest run tests/rehearsal/` | 0 | 31 unit tests pass (runner-helpers + network-watchdog) |
| `npx playwright test --config=playwright.offline.config.ts --list` | 0 | 11 tests in 1 file (single project) |
| `npx playwright test --config=playwright.config.ts --list` | 0 | **78 tests in 9 files** (matches the brief's "78 existing checks") |
| `node scripts/rehearsal/inspect-existing-checks.mjs` | 0 | Wrote `docs/execution/evidence/pre-main-test-journeys-inspection.json` |
| `node scripts/rehearsal/run-automated-repeats.mjs --runs 5 --keep-going` | 0 | 5/5 runs green; runner drops only fresh owned DBs |

## What changed in this iteration (v2 of the lane)

The previous evidence file documented a "symlink node_modules" environment block
and 10 tests in 1 file. This iteration resolves both:

1. **Runner hardening** (`scripts/rehearsal/run-automated-repeats.mjs` + `runner-helpers.mjs`)
   * `--runs` is a positive integer (1–50); unknown flags are refused; spawn
     errors are captured as run failures; per-run network records are written
     to `docs/execution/evidence/pre-main-test-journeys-records.run<N>.json`
     and per-run raw logs to `docs/execution/evidence/pre-main-test-journeys-logs/run<N>.log`.
   * Only fresh owned `fera_e2e_premainjourney_*` DBs are dropped on exit
     (--no-cleanup opt-out); the prefix allowlist is the same hard one the
     Playwright config enforces, so a misconfigured env cannot delete a
     human/demo/shared DB.
   * The DB name is propagated via a manifest file the test process writes
     on afterAll (`pre-main-test-journeys-managed-dbs.<runner-pid>.txt`).
     The runner's child pid is forwarded as `FERA_REHEARSAL_RUNNER_CHILD_PID`.

2. **Spec hardening** (`tests/rehearsal/full-journey-offline.spec.ts`)
   * **Journey 7** — Cache positive extraction (NEW): exercises the
     `EXTRACT_FIXTURE_SOURCE` cache path end-to-end. Asserts `cached: true`,
     `ai_calls_used: 0`, and that the `cases` and `ai_reservations` tables do
     NOT grow on the cache hit. Pins the navigator-offline/cached-badge path
     the brief calls out as "not proven".
   * **Journey 9** (renumbered from 8) — Voice recorder: installs a
     clearly-synthetic `MediaRecorder` stand-in (header bytes `"MOCK"`,
     4 KiB payload), drives the page's start/stop control, and asserts the
     synthetic SHA is not in `TRANSCRIPT_FIXTURES` so no fake "cached: true"
     success can be produced.
   * **Survival test (renamed and re-implemented)** — `suite — offline
     survival: owned second server reads same DB + cache + keys after restart`.
     Spawns an OWNED second `next start` on a different port, with the
     identical env (same DB URL, same `FERA_MODEL_CACHE`, same signing
     keys), waits for `/api/health` to return 200, re-queries the DB
     (cases count, audit count, the closed case from Journey 4) and
     SIGTERMs the child. The first webServer (owned by Playwright) is
     never touched.
   * **Hardcoded home cache path** — `PHASE3_MODEL_CACHE` is now
     `process.env.FERA_MODEL_CACHE ?? resolve(process.cwd(), ".cache/models")`,
     the same resolution the runtime embedder uses.

3. **Test isolation** (`playwright.offline.config.ts`)
   * `testMatch: /.*\.spec\.ts$/` keeps Playwright from picking up the
     new vitest `*.test.ts` unit files.

4. **Unit tests** (NEW — `tests/rehearsal/runner-helpers.test.ts`,
   `tests/rehearsal/network-watchdog.test.ts`)
   * `parseArgs` / `parseRuns` / `replaceSection` / `dropRehearsalDb`
     / `truthy` / `MAX_RUNS` / `KNOWN_FLAGS` / `DEFAULT_DATABASE_URL`
     are all unit-asserted.
   * `classifyUrl` / `LOOPBACK_HOSTS` / `summarize` /
     `assertNoExternalAttempts` are unit-asserted.

## Known gaps (UNVERIFIED, not silent passes)

* Live voice path is not exercised in this run. The cache path is the
  documented one (BR-026, TC-021/056); the live path is UNVERIFIED.
  The new Journey 9 installs a synthetic recorder and asserts the
  route cannot produce a fake `cached: true`.
* The matcher embeddings on a confirmed pair require the local model
  to load and may produce a `failed` `matching_state` on a slow host;
  the dashboard count assertion uses a numeric SQL aggregate so it is
  independent of the matching_state copy.
* The mobile (360×780) and the second-viewport (200% zoom) checks
  are owned by the existing `a11y.spec.ts`; the rehearsal focuses on
  journey wiring, not viewport reflow.
* The cache fix sibling worktree (`pre-main-cache-offline-fixes`) is
  not in this tree; we report that source integration is pending
  coordinator's cherry-pick before a fresh acceptance run.

## Run-by-run results

| Run | Exit | Pass? | Notes |
|----:|-----:|:----:|-------|
| 1 | 0 | ✅ | AUTOMATED | fera_e2e_premainjourney_2316671_0_c64e93
| 2 | 0 | ✅ | AUTOMATED | fera_e2e_premainjourney_2316671_1_0e909f
| 3 | 0 | ✅ | AUTOMATED | fera_e2e_premainjourney_2316671_2_d24d0f
| 4 | 0 | ✅ | AUTOMATED | fera_e2e_premainjourney_2316671_3_480602
| 5 | 0 | ✅ | AUTOMATED | fera_e2e_premainjourney_2316671_4_bb78e3

## Offline network proof

- Total loopback allow: 184
- Total non-loopback deny (external attempts): 0
- Total data:/blob: pass-through: 0

Per-host (only hosts the browser attempted):

| Host | Allow | Deny | Pass |
|------|------:|-----:|-----:|
| 127.0.0.1 | 184 | 0 | 0 |

## Offline cache + log

- Model cache: `/home/obidit/secondBrain/coding/Fera-AI/.worktrees/phase3-finish/.cache/models` (pinned by Playwright config).
  - Files asserted present: `Xenova/multilingual-e5-small/config.json`, `tokenizer.json`, `onnx/model_quantized.onnx`.
- Rehearsal log path: `.e2e-logs/fera_rehearsal_<pid>_<hex>.log` (per-run, gitignored).
- Voice fixture: see Journey 8 — `TRANSCRIPT_FIXTURES` is empty in this build; live voice is UNVERIFIED, no transcript is invented.

## Survives app restart (real, owned second server)

The `suite — offline survival: owned second server reads same DB + cache + keys after restart` test actually spawns a SECOND `next start` process on a different loopback port (`3226`) with the IDENTICAL env the first webServer saw:

* `DATABASE_URL` → same rehearsal DB the first webServer wrote to
* `FERA_MODEL_CACHE` → same on-disk pinned model tree
* `AUTH_SECRET` / `PARENT_COOKIE_KEY` / `DRAFT_SIGNING_KEY` → same throwaway signing keys (so a parent cookie signed by the first server is still valid on the second)
* `DEMO_MODE=1` → same cache-only path

The second server's `/api/health` is probed (real liveness, JSON-shaped). The DB is re-queried through the same OWNER connection: cases count, audit count, and the specific `closed` case row from Journey 4 (with `closed_at` set) are STILL present. The cache file size and mtime are stable. The child is SIGTERMed by the test (the wrapper has a SIGKILL fallback); the first webServer (owned by Playwright) is never touched.

## Voice / cached fixture honesty

Per the brief: if a cached voice fixture exists, the spec uses it; otherwise the spec reports missing live voice and never invents a transcript. The current build has `TRANSCRIPT_FIXTURES = Object.freeze([])` in `src/server/cache/fixtures.ts`; the spec reads the source and labels the test path as `missing-live-voice` accordingly.

## Honest labels (BR-022, FR-010, BR-026)

The spec never claims the cache is offline unless the recorded counts prove it; the cached voice is reported UNVERIFIED when missing; and the close/confirm/import paths carry the documented honest labels ("Referral recorded (simulation)", "[MOCK] …", etc.) surfaced in the rendered pages.

## Known gaps (UNVERIFIED, not silent passes)

* Live voice path is not exercised in this run. The cache path is the documented one (BR-026, TC-021/056); the live path is UNVERIFIED.
* The matcher embeddings on a confirmed pair require the local model to load and may produce a `failed` `matching_state` on a slow host; the dashboard count assertion uses a numeric SQL aggregate so it is independent of the matching_state copy.
* The mobile (360×780) and the second-viewport (200 % zoom) checks are owned by the existing `a11y.spec.ts`; the rehearsal focuses on journey wiring, not viewport reflow.
* Runtime test execution in this worktree is blocked by the symlink `node_modules` issue described above. The static gates (typecheck, lint, --list, inspection JSON) all pass.
