# Dedicated offline runtime — integration evidence

Puku authored the dedicated runtime; the coordinator completed safety fixes after Puku quota exhaustion. Unit and helper regression tests: **152 passed across 10 files**. A real Compose v2 configuration check passed with explicit owner/container/volume values. Tests include actual helper execution against foreign running and exited container fixtures, restrictive persistent key generation, health-response validation, occupied ports and dangling symlink refusal. Source-regex checks were reduced; they do not establish runtime success.

The runtime uses its own worktree-hash container and volume on loopback DB port 3215, app port 3216, and a dedicated fera_demo_premain_* database. All mutation paths refuse foreign ownership. State/provenance writes refuse symlinks and use O_NOFOLLOW. Signing keys contain 32 random bytes, persist locally with mode 0600, and are never logged. App startup requires a production build and a full pinned-cache audit, then validates actual /api/health readiness. Existing developer fera-db on port 54322 must remain untouched.

Full positive start/login/restart/cookie/data-persistence/stop/reuse/reset passed on integrated pre-main: [actual lifecycle evidence](pre-main-demo-lifecycle.json). The unchanged shared developer container ID was checked before and after. Earlier partial worker lifecycle output is not final submission readiness. Human device/rehearsal evidence remains pending. No provider call, production deployment or actual submission is claimed.

## 19 Oct source refresh

Fresh integrated `2ce4cae` runtime lifecycle passed with the seed-completion marker and Docker-unreachable guards. See current [lifecycle](pre-main-demo-lifecycle.json), [verification](pre-main-final-verification.json) and the independently rechecked external review delta. Historical152-test count above describes the earlier scope; current whole-unit suite passes3,981 tests.
