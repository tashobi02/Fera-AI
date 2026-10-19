# Fera AI (ফেরা)

> A Bangla-first case-coordination prototype for missing and found children in Bangladesh.
>
> **Built for:** Hack for Humanity Bangladesh 2026, Round 2.
> **Status:** Synthetic-data prototype. Every name, number and outcome in the demo is invented and labelled `[MOCK]`. No real child data, no live alerts, no police or CID integration, no custody, no return. Similarity scores are not identity probability.
> **Authors:** Sadman Shaharier, Obidit Islam.

## What Fera is

Fera is a web app that helps three people work through the same missing-child case without ever taking the decision out of human hands:

- A **parent or guardian** in the first hours of a disappearance, who can speak Bangla into the phone and get a structured report draft — a GD draft and a no-photo poster — that they review and edit before anything is filed.
- **Station, shelter or help-desk staff** who log a found child in under two minutes on a shared desk PC.
- A **verified officer** on a laptop who sees a ranked list of likely missing ↔ found matches, compares them side by side, and records the decision.

The app drafts, retrieves and ranks. **A verified officer confirms or rejects every match.** A "confirmed" pair is a recorded coordination outcome in the database and a simulated referral — it is not a child being returned, rescued or reunited.

## How it works, end to end

1. **Parent reports a missing child** (mobile, Bangla or English)
   - Speaks 5–120 seconds of voice *or* types 20–2,000 characters.
   - Sees a transcript and a structured draft (name, age, sex, district, clothing, last seen when/where).
   - Edits anything that is wrong; leaves anything unknown as unknown.
   - Reviews the GD draft and a no-photo poster. Confirms before the report is filed.
2. **Staff log a found child** (desktop, under two minutes)
   - A short form: where, when, what the child said, clothing, contact channel.
   - Submitted; the report is searchable from the moment it is filed.
3. **The matcher retrieves and ranks**
   - For every open missing report, the system produces a ranked list of found reports that look similar.
   - The ranking is **similarity**, not identity. "0.92" means looks-like-this, not is-this-the-same-child.
4. **A verified officer reviews and decides** (laptop)
   - Compares the missing report and each candidate found report side by side.
   - Clicks **Confirm** or **Reject**. A confirmed match records a decision, voids every competing candidate, writes an audit row, and — only in this prototype — inserts a *simulated* referral. The missing case is closed as `confirmed`; the found case is closed as `referred`.
   - "Referred" here means the row exists. No one has been contacted, no one has been moved, nothing has been delivered.
5. **The dashboard updates** with honest district counts (missing, found, confirmed, referred, closed) that always show their denominators.

A second AI pass — the **duplicate detector** — looks at every newly-stored report and quietly flags other reports of the same kind that may be the same child (very close match on name, age, sex, district and time). It only *flags*; it never hides, merges or closes a report, and a shared phone number alone is never enough to link two reports.

## What Fera explicitly does not do

- **No real children.** Every record is invented and labelled `[MOCK]`. No photos, no faces, no ID documents, no exact coordinates.
- **No alerts.** Nothing is broadcast. No SMS, no voice calls, no app push. No "runaway" labels.
- **No live integration.** No CID, no MUN Alert, no police API, no GD auto-filing, no external referral delivery, no child-return operation, no custody transfer.
- **No automatic confirmation.** AI ranks. A verified officer decides. The verifier status is itself simulated in this prototype and labelled.
- **No legal-compliance claim.** The spec quotes relevant law; nothing in this repo is a compliance conclusion.
- **No production deploy.** This is a local-only prototype. There is no managed database, no submission email, no `r2-freeze` tag, and no measured-on-release numbers. Dev diagnostics are disclosed with their denominators and explicitly **not** release figures.

## How to run it locally

You need Node.js `^22.12.0` or `>=24`, Docker (for the local PostgreSQL 16 + pgvector container), and a working `git` checkout. Everything below is read-only against a fresh loopback database unless you opt in.

```sh
cp .env.example .env.local          # template only; no real keys committed
npm ci                               # install dependencies
npm run db:up                        # start the local fera-db container
npm run model:fetch                  # fetch the four pinned q8 model assets (offline-only after)
npm run db:reset                     # apply schema_v2.sql + roles.sql to a fresh DB
npm run seed -- --set demo           # load the [MOCK] demo dataset (district centroids, synthetic cases)
npm run dev                          # http://127.0.0.1:3000
```

Sanity checks (each green is its own gate):

```sh
npm run typecheck                    # tsc --noEmit
npm run lint                         # 0 errors expected
npm test                             # vitest unit suite (Node)
npm run test:db                      # vitest + PostgreSQL integration suite (creates a fresh loopback DB per file)
npm run build                        # Next.js / Turbopack production build
```

`db:up` must only point at a local loopback database — never at a shared or production one. `model:fetch` writes the model into `data/`; the runtime refuses `allowRemote: true` afterwards.

## Where to read more

The authoritative V2 spec pack is in `docs/` (also mirrored in `docs/spec/`):

- `docs/README.md` — package overview and the change map.
- `docs/markdown/TEAM_HANDOVER_V2.md` — handover, verification limits, schedule and worksheet.
- `docs/markdown/D1_PRD_V2.md` — product requirements (FR / BR / TC).
- `docs/markdown/D2_TRD_PartA_V2.md` and `D2_TRD_PartB_V2.md` — technical contracts, schema, security, privacy, cost, evaluation.
- `docs/markdown/D3_App_Flow_V2.md` — every screen and error code.
- `docs/markdown/D4_Design_Brief_V2.md` — design rules.
- `docs/markdown/D6_Implementation_Plan_V2.md` — task board and acceptance plan.
- `docs/MANIFEST.json` — SHA-256 hashes of every included file.

Companion code (always kept byte-identical to the spec):

- `db/schema_v2.sql` — runtime copy of the schema (also at `docs/code/schema_v2.sql`).
- `db/roles.sql` — `fera_app`, `fera_owner`, `fera_redactor` grants.
- `docs/code/fera_types_v2.ts` — TypeScript contract types.
- `docs/code/tokens_v2.css` — design tokens.

Engineering workflow, agent roster, lane scripts and review process live in `AGENTS.md`. The visual system is in `DESIGN.md`. The product brief is in `PRODUCT.md`.

## Round 2 submission context

- **Hackathon:** Hack for Humanity Bangladesh 2026, Round 2.
- **Working baseline deadline:** Wed 14 Oct 2026, 22:00 (Asia/Dhaka). The user has reported an organiser extension; the exact final cutoff, channel and required formats are **UNKNOWN** until the team lead records them.
- **Kit due:** 23 Oct 2026. **Finale:** 24 Oct 2026.
- **Plan and live status:** `docs/execution/EXECUTION_PLAN.md` and the per-phase `docs/execution/PHASE_*.md` trackers.
- **What "submitted" means here:** Round 2 was reported submitted on the organiser platform by a team member on 18 Oct 2026; the precise time, submitter and platform acknowledgement are **UNKNOWN** to the repository.
- **What is and is not done:** the local application builds, typechecks, lints and runs the full unit + DB + browser suite. Production deploy, managed database, held-out evaluation, real provider accounts, partner approval and a measured-on-release smoke are **not** done. The Phase 4 deliverable pack (editable slides, scripts, recorded local demo, evidence files) is integrated at commit `27bb3c6`; the application source is at `9155963` (and now further along on `main`).

If you are a judge, organiser or reviewer: please read the "What Fera explicitly does not do" section before anything else, then `docs/README.md` and `PRODUCT.md`. If you are a developer who wants to run it, the "How to run it locally" section is the only thing you need to start; everything else is reference.
