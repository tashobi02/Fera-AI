# TASK-006 evidence — credentials session, principal resolver, parent cookie, seeded users

Owner: Mahim · Lane: `mahim-auth` (Claude Code), branch `phase2--mahim-auth` · Date: 2026-10-15 (Asia/Dhaka) · Links: TASK-006 (T009/T010), FR-035/037, BR-007/010/024, TC-023 (plus the role and parent-ownership parts of TC-022/044/052), D2 Part A §5.3, §9.1–9.5 and API-020, D2 Part B §10 and §15.5, D3 SCREEN-008 and §1.

All accounts and data are synthetic. Nothing here touches a hosted database. The hosted deployment is **UNKNOWN**: nothing was deployed and no CI `db` job was run.

## What was built

| Area | Files | Notes |
|---|---|---|
| DB pool | `src/server/db/pool.ts` | Lazy `pg` pool from `DATABASE_URL`, read at call time and never logged; app connects as `fera_app`. Connect timeout 5 s, max 5 per instance. No `statement_timeout` option, so the role settings from `db/roles.sql` apply (30 s / lock 5 s / idle-in-transaction 60 s). `setPoolForTests()` is the injection seam. Payload redaction (API-016) must use a separate `FERA_REDACTOR_DATABASE_URL` pool as `fera_redactor`; that is not wired yet. |
| Password KDF | `src/server/auth/password.ts` | argon2id, m = 19 MiB, t = 2, p = 1 (OWASP minimum), via `@node-rs/argon2`. Passwords are NFC-normalised before hashing and verifying (Bangla input methods), and `hashPassword` refuses fewer than 10 or more than 200 characters (D2B §10.2 A07), so later create/reset paths inherit the minimum. Only hashes with exactly these parameters are accepted. Every verify runs one argon2 verification; an unknown user or an unusable stored hash is checked against a per-process dummy hash, so it costs the same as a wrong password. The sign-in route builds the dummy hash at module init, so the first unknown-user attempt does not pay for two hashes; a failed dummy build is not cached. |
| Signed cookies | `src/server/auth/tokens.ts`, `secrets.ts` | HMAC-SHA256 with per-purpose subkeys of `AUTH_SECRET` and `PARENT_COOKIE_KEY` (D2B §15.1: 32+ bytes, base64). Each key is loaded only where it is used, so staff sign-in does not need `PARENT_COOKIE_KEY` and parent intake does not need `AUTH_SECRET`. In production (Vercel or `NODE_ENV=production`, which includes the `DEMO_MODE=1` laptop) a missing or short key fails closed with E-021. In dev/test a missing key becomes a random per-process key with one `auth.dev_secret` warning. |
| Principal resolver | `src/server/auth/session.ts`, `store.ts`, `default.ts` | Implements the API layer seam `{ req, api, cookies }` and is now the default in `src/app/api/_shared/index.ts`. The null resolver is still exported as `stubResolver` for tests. |
| Page guards | `src/server/auth/require-role.ts` | `requireRole(allowed, returnTo, { auditDenied? })`, `setPageAuditDenied`, `currentPrincipal()`, `decideAccess`, `safeReturnPath`, `signInPath`, `roleHome` for S-008/S-012/S-013 and the desk pages. Reads the raw `Cookie` header (`headers()`), so duplicated cookies are refused exactly as in route handlers. A signed-in wrong-role visit calls the page-denial audit hook (`access.denied` input: principal, effective role, pathname, E-004, reason `role`, case null) and then shows not-found. With no hook installed, or when the hook throws, it fails closed: it throws to the error page, not SCREEN-016, as the API layer answers E-021 without its audit hook. TASK-015 owes the hook (OD-006-5). |
| API-020 | `src/app/api/auth/sign-in/route.ts`, `sign-out/route.ts`, `src/server/auth/sign-in.ts` | Both routes go through `defineRoute` (public, same-origin, envelope, no-store, logs). |
| Seed | `scripts/db/seed-users.mjs`, `npm run seed:users` | Local only (guard.mjs). Seeds 1 admin, 2 verified officers, 1 unverified officer and 2 staff (D2B §15.5). The committed local passwords are used only for a plain local dev run (default admin URL and database, no `DEMO_MODE=1`, no `NODE_ENV=production`); otherwise `SEED_ADMIN_PASSWORD` and `SEED_USER_PASSWORD` must be set explicitly (16–200 characters, NFC-normalised). **Finale laptop:** run `DEMO_MODE=1 SEED_ADMIN_PASSWORD=… SEED_USER_PASSWORD=… npm run seed:users` with passwords chosen on the day and kept off the repo. |

### Session model

- **Credential session.** Cookie `fera_session` (`__Host-fera_session` with Secure cookies) holds `u1.<user id>.<issued>.<expires>.<password fingerprint>.<HMAC>`. Its lifetime is exactly 8 h, and the server checks the expiry itself rather than trusting Max-Age. Role, `verified` and `is_active` are **not** in the token. The resolver re-reads `users` on every request, refuses inactive accounts, and refuses a token whose password fingerprint no longer matches, so a password reset ends every session for that account. It then builds the principal only through `userPrincipal()`.
- **Parent session.** Cookie `fera_ps` (`__Host-fera_ps` with Secure cookies) holds `p1.<parent_sessions id>.<HMAC>`, an opaque signed ID. The row must exist, be unexpired and be unrevoked, and the principal is built through `parentPrincipal()`. The session is minted (`INSERT INTO parent_sessions DEFAULT VALUES`) **only on API-001/002**, and only when no usable parent session and no credential cookie is present. Max-Age is the row's remaining lifetime, at most 30 days. **OD-022-5 (2026-10-17):** API-003 also mints, but only when no parent cookie is sent at all. A present but dead one gets E-002 and is cleared, so the next submit mints.
- **Precedence.** If a credential cookie is present, it decides alone. A present but invalid one (bad signature, expired, inactive, password changed, duplicated) gives no principal (E-002, sign in again). It never falls back to a parent session and never mints one.
- **Cookies.** HttpOnly, SameSite=Lax, Path=/, no Domain. Secure and the `__Host-` names apply in production. `DEMO_MODE=1` (the plain-HTTP finale laptop) turns them off, **except on Vercel**, which keeps Secure cookies even with `DEMO_MODE=1`. A production server running without Secure cookies logs `auth.insecure_cookies` at error once. With Secure cookies only the prefixed names are read, so an unprefixed cookie planted by another origin is ignored. A duplicated cookie name is refused, in route handlers and page guards alike.
- **Browser authority.** Role, verified and owner flags in cookies, headers or the body are ignored (tested).

### API-020 behaviour

- `POST /api/auth/sign-in` takes `{ username, password }` as JSON and returns the `SessionView` from the contracts, built on the server. Every failure gives the same body: E-002 (401). That covers malformed or non-JSON bodies, the wrong content type, oversize input, an unknown user, a wrong password and an inactive account.
- The limit is RATE_LIMITS.signInFailures, counting failures only (`peek` before the attempt, `hit` after a failure). Each attempt also reserves an in-flight slot synchronously on arrival, and is admitted only while stored failures plus attempts ahead of it stay under 5. A parallel burst therefore runs at most 5 argon2 checks per window and network key (tested: 12 parallel → 5 × E-002, 7 × E-007, 5 lookups). Successes hold a slot only while they run. After 5 failures a minute per hashed network key, sign-in answers E-007 with `Retry-After`, even for the right password. The store is per-instance memory (OD-006-3), so the TC-023 brute-force limit is shown for one instance only and **cannot be claimed for a hosted multi-instance deploy**.
- A cross-site POST is refused with E-003 before any lookup (login CSRF). The session key is checked before the credentials, so a misconfigured server answers E-021 for right and wrong passwords alike (no password oracle).
- **No audit row.** The contracts' audit actions (`match.confirm`, `match.reject`, `case.payload_redacted`, `access.denied`) have no sign-in event, and D2A does not ask for one. The request log line carries the error ID and `reason: "credentials"` only, never the username or the password.
- `POST /api/auth/sign-out` clears the session cookie and returns `{ signed_out: true }`.

## Verification (2026-10-15, local, after review round 1)

| Command | Exit | Result |
|---|---|---|
| `npm run lint` | 0 | clean |
| `npm run typecheck` | 0 | clean |
| `npm test` | 0 | 616 passed, 79 skipped (the DB suites); 111 of them in `tests/auth/` |
| `npm run build` | 0 | routes `/api/auth/sign-in`, `/api/auth/sign-out`, `/api/health` |
| `npm run test:db` | 0 | 79/79 on PG 16.15 + pgvector 0.8.1: platform 48, redaction 18, **auth 13**, each on its own `fera_test_*` database |

New unit tests (`tests/auth/`):
- **password (7):** argon2id format and parameters, fresh salt, wrong/empty passwords, malformed/other-algorithm/weaker-parameter hashes refused without throwing, 10–200 length bounds, NFC (ো typed as ে + া verifies against U+09CB), warm-up, and unknown-account vs wrong-password cost ratio within 0.5–2.
- **tokens (17):** round trip and exact 8 h, expiry, future-issued tokens, every edited field, foreign key or purpose. Also cookie header parsing with duplicates, `__Host-` names, attributes in production and in DEMO_MODE, the sign-out clear line, the session view, and key loading (production requires a key, dev falls back, short keys refused and not echoed, subkeys distinct). Secure mode: on in production, off under DEMO_MODE=1, always on with VERCEL; `auth.insecure_cookies` logged once at error in production without Secure, never in dev.
- **roles (38):** TC-023 through the real resolver and the API layer:
  - A verified officer gets officer permissions.
  - An unverified officer gets E-003 on officer routes and E-004 on API-010 confirm (handler not reached; the denial hook receives the server-derived principal), and works as staff on API-007.
  - Staff and admin are refused candidate and confirm routes.
  - An inactive account gets E-002 with a valid token.
  - Verification, active state and role are re-read per request.
  - A password reset or deleted account ends the session.
  - Flags in cookie, header or body are ignored.
  - Edited, duplicated or foreign-key tokens get E-002.
  - An invalid credential cookie never falls back to a parent session.
  - No cookie means no database read.
  - Parent cookies resolve to their own row only; forged, unknown, expired, revoked or duplicated parent cookies get E-002.
  - API-001/002 mint once and then reuse; an expired or revoked session is replaced on API-001; staff on API-001 get no parent cookie.
  - Each of the other 19 non-public APIs never mints.
  - `__Host-` names apply with Secure cookies, and the unprefixed name is ignored there.
  - The default factory answers E-002 with no cookie.
- **sign-in (11):** success with the server-derived view (role/verified in the body ignored), and the cookie authenticates the next request. Nine failure kinds give byte-identical E-002 bodies with no cookie. Unknown vs wrong-password timing ratio is within 0.5–2. E-007 after 5 failures even with the right password, while other networks are unaffected. Successes are not counted. Cross-site requests are refused before lookup. A missing session key gives E-021 for both passwords before lookup; a missing parent key does not affect sign-in. A parallel burst of 12 runs 5 checks (5 × E-002, 7 × E-007), and 5 parallel successes all pass.
- **require-role (35):** access decisions (unverified officer as staff, parent never sent to sign-in), return paths including every dot-segment open-redirect case (`/.//evil.com`, `/a/..//evil.com`, `/..//evil.com`, `/%2e//evil.com`, `/.%2e//evil.com`, `/%2E%2E//evil.com`, `/a/./b`, `/a/%2e%2e/b`, all null; dotted names such as `/.well-known` kept), sign-in path and role homes. Also `requireRole` with the raw Cookie header: signed-out visitors redirect without audit, garbage cookies skip the database, duplicated cookies are refused, the right role passes, a wrong role calls the audit hook with E-004/`role`/pathname and then shows not-found, the installed hook is used, a missing hook throws `PageAuditUnavailableError`, a throwing hook propagates, and parent-only pages show not-found without audit.
- **pool (3).**

DB tests (`tests/db/auth.test.ts`, as `fera_app` against the real route modules):
- The seed creates the six accounts with argon2id hashes and `[MOCK]` display names that pass `displayNameSchema`. It is idempotent and resets the accounts, prints no password, and refuses a non-local host and short passwords, and refuses the committed default passwords when FERA_DB_NAME is overridden.
- A verified officer gets officer permissions.
- An unverified officer gets E-003/E-004 and staff permissions.
- Un-verifying through `fera_app` (the API-017 grant) downgrades the next request.
- An inactive account gets E-002 for its existing session and at sign-in.
- Role flags in cookie, header or body are ignored.
- Wrong password and unknown user give the same status and byte-identical body, with no cookie and a mean timing ratio within 0.5–2 (6 attempts each).
- Sign-out clears the cookie.
- API-001 mints exactly one `parent_sessions` row and reuses it; API-003/004/018/007 never mint.
- A parent cookie resolves to its own row only; an expired session gets E-002 and is replaced on API-001; a revoked session (the `fera_app` UPDATE) gets E-002.

Built-app smoke, run at `ee76e12` before review round 1 and not repeated (`next start`, a throwaway local `fera_auth_smoke` database, dropped afterwards; random keys in the process environment):
- With `DEMO_MODE=1`: sign-in 200 sets `fera_session=…; Path=/; SameSite=Lax; Max-Age=28800; HttpOnly`. Wrong password and unknown user both return 401 with the same E-002 body. A cross-site request gets 403, and sign-out clears the cookie. This also confirms that the native argon2 module loads under the Next build.
- Production mode without `DEMO_MODE`: the cookie is `__Host-fera_session=…; HttpOnly; Secure`.
- Production without `AUTH_SECRET`: 500 E-021 for both right and wrong passwords.

**Not covered here.**
- The E-004 record views and the `access.denied` row itself are TASK-015 (API-004), and TC-023's "candidate still pending" needs the API-010 case service. Here the handler is not reached.
- Browser behaviour (local HTTP cookies, separate profiles, S-008 UI) is TASK-031.
- Timing equality is measured locally only; it is not a statistical guarantee.

## Review round 1 (fera-review, 2026-10-15)

| # | Finding | Fix |
|---|---|---|
| 1 | BLOCK (safeguarding, BR-010): wrong-role page visit showed not-found without `access.denied` | Page-denial audit hook in `requireRole`; fails closed without one (OD-006-5) |
| 2 | BLOCK (security): open redirect via dot segments in `safeReturnPath` | Dot segments (incl. `%2e`) refused before parsing; normalised result must start with exactly one `/` |
| 3 | WARN: peek-then-hit race in the sign-in limiter | In-flight slot reserved on arrival; concurrency tests |
| 4 | WARN: DEMO_MODE=1 drops Secure everywhere | Secure always on with VERCEL; `auth.insecure_cookies` logged once |
| 5 | WARN: `cookies().getAll` hides duplicates | Page guards read the raw Cookie header |
| 6 | WARN: committed seed passwords usable anywhere | Refused under DEMO_MODE=1, NODE_ENV=production or overridden DB settings |
| 7 | WARN: no minimum password length | `hashPassword` minimum 10 |
| 8 | WARN: tracker said "Auth.js credentials" | Tracker row renamed |
| 9–12 | Notes | Dummy hash warmed at route init; per-purpose key loading; NFC passwords; TRUST_PROXY, stateless-session and parent_sessions growth documented (OD-006-2/3/4) |

## Dependency

- **`@node-rs/argon2` 2.2.1 (exact pin)** is a runtime dependency. D2B §10.1/§10.2 require argon2id. `node:crypto` only gained argon2 in Node 24.7, and `package.json` allows Node 22.12+, with 24.5 installed locally, so `node:crypto` is not enough.
  - It ships prebuilt N-API binaries with no build step, is on Next's built-in `serverExternalPackages` list, and runs on the libuv pool, which bounds concurrent memory to about 4 × 19 MiB.
  - Version 2.2.2 was published 2026-10-06, less than two weeks ago, so 2.2.1 (2026-09-10) is pinned.
  - The lockfile adds only the `@node-rs/argon2*` entries (+233 lines). `npm install` first dropped the other platforms' optional entries (rolldown, fsevents, lightningcss), a known npm bug, so the lockfile was rebuilt from HEAD plus the new entries, and the three pruned local binaries were restored from integrity-matched tarballs.
- **Auth.js: not added** (see OD-006-1). There are no other new dependencies.

## Open decisions

- **OD-006-1 (needs all-owner review): no Auth.js.** D2A §5.3/§9.1, the constitution's stack line and T010's `[...nextauth]` path name Auth.js. `next-auth@5.0.0-beta.32` (2026-07-20) declares `next ^16` and would install. It was not used, for these reasons:
  1. API-020 needs the generic E-002 envelope, failure-only E-007 and the same-origin check through `defineRoute`. Auth.js's own `/api/auth/callback/credentials` endpoint answers with redirects and would bypass all three unless wrapped.
  2. D2A §9.3 requires the user row to be re-read on every request anyway, so Auth.js would only contribute the cookie crypto.
  3. v5 is still a beta; `latest` is v4.24.15.
  4. Its `next/headers`-based API cannot be unit-tested through the API layer's resolver seam.

  The replacement is the smaller design described above: a signed, HttpOnly, 8-hour, server-validated token, with no new dependency.

  If the owners want Auth.js, only `session.ts` (token issue/verify) and the two route files change; the resolver contract, guards and tests stay. If this is accepted, AGENTS.md/constitution/D2A wording and T010's path need a docs PR.
- **OD-006-2 (needs owner sign-off): stateless credential sessions.** There is no user-session table in the frozen schema, so there is **no server-side revocation of a single session**. D2B §10.1 (CSRF row) mentions server expiry/revocation checks; this design has expiry, and revocation only per account (deactivate or reset the password). Sign-out clears the cookie on that browser only. A copied token stays valid until its 8 h expiry. This is the same property as Auth.js's JWT strategy.
- **OD-006-3: sign-in limiter scope.** It is per instance and in memory (API-OD-1). Without `TRUST_PROXY=1`, all laptop clients share one network bucket (API-OD-2), so 5 failed attempts a minute from any device block sign-in for everyone for up to a minute. `TRUST_PROXY=1` makes the limiters trust the **first** `x-forwarded-for` hop. Set it only behind a proxy that overwrites that header; otherwise a client can choose its own network key and bypass the sign-in and AI limits. Vercel is trusted automatically.
- **OD-006-4: parent session minting cost.** API-001/002 insert the `parent_sessions` row in the resolver, before the route's AI limits. Row creation is bounded only by the 300/min per-network pre-auth limit. `last_seen_at` is not updated. `parent_sessions` rows are **unbounded**: nothing deletes expired or revoked rows, and an anonymous client can create about 300 a minute per network key. A cleanup job or a cap is an open decision.
- **OD-006-5: page-denial audit is an obligation, not an exemption.** BR-010 / D2B E-004 require an `access.denied` row for every signed-in denial. `requireRole` calls the page-denial hook for a signed-in wrong-role visit and fails closed (throws, error page) until TASK-015 installs it with `setPageAuditDenied`. The hook input carries no record ID because the guard denies before any record is loaded. Record pages that load a specific case still deny through the case service.
- **OD-006-6: seed variables.** D2B §15.1 lists only `SEED_ADMIN_USER`/`SEED_ADMIN_PASSWORD`. This lane adds `SEED_USER_PASSWORD` for the five desk accounts, with committed local defaults (≥16 characters, loopback only, synthetic) that are refused under DEMO_MODE=1, NODE_ENV=production or an overridden FERA_DB_ADMIN_URL/FERA_DB_NAME. `.env.example` was not read or updated in this lane (`.env*` rule). It should list `AUTH_SECRET`, `PARENT_COOKIE_KEY`, `SEED_ADMIN_USER`, `SEED_ADMIN_PASSWORD`, `SEED_USER_PASSWORD` and later `FERA_REDACTOR_DATABASE_URL`; whether it already does is **UNKNOWN**.
- **OD-006-7: E-019 on intake.** The resolver treats an expired parent session as none and mints a fresh one on API-001/002, rather than answering E-019. The draft-token check (Obidit) still answers E-019 for a draft bound to the old session.

## Contract changes wanted (not made; `src/contracts/` is frozen)

- `signOutResponseSchema = z.strictObject({ signed_out: z.literal(true) })` for API-020 sign-out. It is defined locally in the route for now.
- None needed for sign-in: `signInRequestSchema`, `parseSignInRequest`, `sessionViewSchema`, `userPrincipal` and `parentPrincipal` are used unchanged.
