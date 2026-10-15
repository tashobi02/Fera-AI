# TASK-009 evidence — 64 districts, adjacency and `npm run seed`

Owner: Masnun · Lane: `masnun-districts` (Claude Code), branch `phase2--masnun-districts` from `origin/phase2` @ `0617b4c` · Date: 2026-10-15 (Asia/Dhaka) · Links: TASK-009, DEP-004, A-013, A-019, A-032, OQ-017, ENTITY-010/011, DECISION-013, D6 TASK-009 ("`npm run seed` loads 64 districts").

All data is reference data at district level. No person, case, photo, ID or exact coordinate is involved.

## Status against "Done when `npm run seed` loads 64 districts"

**Not demonstrated end to end on this machine.** The loader and its PostgreSQL test are written and reviewed, but Docker and `psql` are not installed here, so `npm run seed` and `npm run test:db` were **not** run against a database. Everything that does not need a database passed (below). The first person with the local `fera-db` stack should run the two commands in "To finish verification" and paste the counts here.

## What was built

| Area | Files | Notes |
|---|---|---|
| Data | `data/districts.json` | 64 districts: Fera-internal codes 1–64 (alphabetical by English name, A-032), `name_en`, `name_bn`, `division_en`, 2-decimal centroids, `neighbours` (codes). 280 directed edges = 140 undirected pairs, stored in both directions. A `provenance` block labels the set **UNVERIFIED, AI-compiled**; `verified_by`, `verified_on` and `source` are `null`. |
| Loader | `db/seed/districts.mjs` | `loadDistrictData`, `validateDistricts` (count, codes, unique clean names, NFC Bengali, division set, lat/lng type and range, symmetric adjacency, no self/duplicate/unknown neighbour), `buildNeighbourRows`, `seedDistricts` (one transaction: upsert districts, replace adjacency). Refuses to change an existing code's `name_en` unless `allowRecode` (codes are frozen identifiers). |
| Command | `db/seed/index.mjs`, `package.json` (`seed`) | `npm run seed [-- --set demo\|full] [--allow-recode]`. Local only through `scripts/db/guard.mjs`; owner connection like `seed:users`. `--set` is accepted but loads **no records yet** (TASK-010/019) and the output says so. |
| Tests | `tests/data/districts.test.ts` (20), `tests/db/districts-seed.test.ts` (6, in `npm run test:db`), `scripts/db/test-db.mjs` | Data contract, frozen code→name checksum, uncertain pairs absent, validator negatives, CLI arguments; DB: counts, idempotency and restore, both-direction adjacency, recode refusal, rollback as `fera_app`, read-only privileges. |

## Verification (2026-10-15, local)

| Command | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 41 files passed, 5 skipped (DB-gated); 954 tests passed, 123 skipped |
| `npm run build` | succeeds |
| `node db/seed/index.mjs` with a non-local `FERA_DB_ADMIN_URL` | refuses (exit 1) |
| `node db/seed/index.mjs --bogus` | `unknown argument` (exit 1) |
| `npm run test:db` / `npm run seed` against PostgreSQL | **NOT RUN** (no Docker/psql on this machine) |

## Review (`fera-review`, 5 reviewers, read-only; diff = the 7 task-owned files)

| Reviewer | Verdict | Handled |
|---|---|---|
| `fera-safeguarding-reviewer` | PASS | Dropped Netrokona–Sherpur and Faridpur–Pabna as uncertain; provenance reworded; owner of the A-019 check named as UNKNOWN. |
| `database-reviewer` | PASS | Added rollback-as-`fera_app`, restore-after-edit and both-direction tests; doc comment on the "not already in a transaction" assumption. |
| `typescript-reviewer` | approve | Removed non-null assertions where cheap; pinned error messages; added validator negatives, `parseArgs` tests, typeof check on lat/lng. |
| `mle-reviewer` | approve with warnings | Code stability: anchor pairs + checksum test and the recode refusal; provenance says "AI-compiled, unverified" for neighbours, with null `verified_by`/`source`; validator gained division, NFC and degree checks. |
| `bengali-reviewer` | approve | Tightened the Bangla-name regex (letter start, no digits/danda, no doubled or trailing hasanta, no zero-width). |

Not adopted: a `slug` column or code numbers above 64 (schema is frozen at 1–64; see OD-009-1).

## What is NOT done

- Centroids, Bangla spellings and adjacency are **not checked against a public source** (DEP-004/A-019). The check's owner is UNKNOWN until assigned; OQ-017 lists Masnun.
- Adjacency is incomplete by design. Reviewers named possible missing pairs that were not added because they were uncertain: Tangail–Dhaka, Sirajganj–Gaibandha, Bhola–Chandpur, Bagerhat–Barguna, Narayanganj–Cumilla, Patuakhali–Pirojpur.
- The provenance stays in the JSON, not the database. Any screen that shows centroids or adjacency (S-011 map, TASK-030) must add its own "approximate / unverified" label.
- No synthetic records, users or demo set (TASK-010, TASK-019).

## Handoff notes for Obidit's TASK-012 (district aliases)

- Normalise input to NFC first: some keyboards produce U+09DC/09DD/09DF (precomposed ড় ঢ় য়), which NFC turns into base + nukta, the form stored here.
- Build a variant-fold table, not only canonical names: ি/ী (গাজীপুর/গাজিপুর), ণ/ন, dropped ঁ, ঙ্গ/ং (রাঙ্গামাটি/রাঙামাটি), জ/য (যশোর/যশোহর), and Latin forms (Comilla, Chittagong, Jessore, Bogra, Barisal).
- Eight district names are also division names (ঢাকা, চট্টগ্রাম, খুলনা, বরিশাল, ময়মনসিংহ, রাজশাহী, রংপুর, সিলেট): resolve to a district code by context, never by name alone.
- Shared affixes (-পুর, -গঞ্জ, -হাট) make fuzzy matching ambiguous: use whole-token matching and return no match on a tie.
- Unsure variant spellings the reviewer asked a human to confirm: রাঙ্গামাটি, শরীয়তপুর, নেত্রকোণা, টাঙ্গাইল.

## Open decisions

| ID | Question | Who |
|---|---|---|
| OD-009-1 | Codes are positional (alphabetical) and frozen. Is that acceptable, or should a stable slug be added? A new district would need a schema change (code CHECK is 1–64). | Masnun, then all owners |
| OD-009-2 | Who verifies centroids, names and adjacency against a public source, and by when? | UNKNOWN |
| OD-009-3 | `division_en` is stored as English only; a Bangla division name is not in the schema (screens that show it need a locale lookup). | Masnun / Obidit |

## To finish verification (needs Docker)

```sh
npm run db:up && npm run db:reset
npm run seed            # expect: loaded {"districts":64,"neighbours":280}
npm run test:db         # expect districts-seed: 6 passed
```
