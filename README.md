# Fera AI (ফেরা)

Fera AI is a planned Bangla-first web app for missing-child case coordination in Bangladesh, prepared for Hack for Humanity Bangladesh 2026. A parent or guardian reports a missing child by browser voice recording or text, reviews the structured report, and receives draft text outputs. Shelter and station staff record found-child reports; AI retrieves and ranks possible matches for a verified officer to review. Each case tracks a recorded coordination outcome. This hackathon prototype uses invented synthetic records; a recorded referral or closure does not establish delivery, identity, custody, rescue or safe reunification.

> **Status**
>
> Prototype · Synthetic data only · Implementation not verified · Metrics not measured
>
> This repository contains the V2 specification package, an existing clickable HTML demo, and minimal root skeleton files. The application has not been built. Provider accounts, partner approval and live referral delivery are absent.

## Safeguarding rules

- AI retrieves and ranks only. A verified officer confirms every match. Officer verification is simulated and labelled in this prototype.
- No alerts issued or broadcast. No photos, face search, or identity documents. No "runaway" labels. No physical return action.
- No legal compliance claims. The Personal Data Protection Act (2026) has not been reviewed.
- Invented synthetic data only. Similarity is not identity probability. `referred` means referral recorded in a simulation; `closed` records a coordination outcome.

## What the project does not do

- No alerts or CID or MUN Alert integration.
- No live police data or real-child intake.
- No SMS or voice-call intake; planned voice intake uses a browser recording.
- No automatic GD filing, external referral delivery or child-return operation.

## Planned stack

The following choices are **planned**, from D2; they are not installed or verified here.

| Area | Planned choice |
|---|---|
| UI and API | Next.js App Router, React, strict TypeScript, Tailwind CSS; Node.js route handlers |
| Validation and database access | Zod; `pg`, `pgvector` helper and hand-written SQL |
| Database | PostgreSQL 16 with pgvector >= 0.8.1; managed host pending |
| Authentication | Auth.js credentials for staff/officers/admins; signed anonymous parent cookie |
| Speech and extraction | Whisper API speech adapter; Gemini, OpenAI and Claude LLM adapters; accounts/models pending |
| Embeddings | Transformers.js with a local multilingual model; multilingual-e5-small (384 dimensions) is a candidate |
| Map and exports | Leaflet; optional online OpenStreetMap tiles; bundled district geometry/table offline; browser canvas poster PNG |
| Hosting | Vercel for Round 2; laptop-local app and PostgreSQL for an isolated fallback journey |
| Verification and logging | Vitest, Playwright, axe, `tsx` evaluation scripts and pino |

## Current repository layout

Only existing project files are shown; Git metadata and workspace control directories are omitted.

```text
.
├── README.md
├── package.json
├── tsconfig.json
├── .gitignore
├── .env.example
├── demo/
│   └── Fera — clickable prototype and blueprint.html
└── docs/
    ├── README.md
    ├── MANIFEST.json
    ├── code/
    │   ├── schema_v2.sql
    │   ├── fera_types_v2.ts
    │   └── tokens_v2.css
    ├── markdown/
    │   ├── 00_Gap_Check_and_Registry_V2.md
    │   ├── TEAM_HANDOVER_V2.md
    │   ├── D1_PRD_V2.md
    │   ├── D2_TRD_PartA_V2.md
    │   ├── D2_TRD_PartB_V2.md
    │   ├── D3_App_Flow_V2.md
    │   ├── D4_Design_Brief_V2.md
    │   ├── D5_Background_Schema_V2.md
    │   ├── D6_Implementation_Plan_V2.md
    │   └── D7_Closing_Pack_V2.md
    ├── pdf/
    │   ├── 00_Gap_Check_and_Registry_V2.pdf
    │   ├── TEAM_HANDOVER_V2.pdf
    │   ├── Fera_AI_Complete_Team_Handbook_V2.pdf
    │   ├── D1_PRD_V2.pdf
    │   ├── D2_TRD_PartA_V2.pdf
    │   ├── D2_TRD_PartB_V2.pdf
    │   ├── D3_App_Flow_V2.pdf
    │   ├── D4_Design_Brief_V2.pdf
    │   ├── D5_Background_Schema_V2.pdf
    │   ├── D6_Implementation_Plan_V2.pdf
    │   └── D7_Closing_Pack_V2.pdf
    └── verification/
        ├── README.md
        ├── schema_checks.mjs
        ├── schema_checks.json
        ├── document_checks.json
        ├── contrast_checks.json
        └── pdf_checks.json
```

## Setup commands

There is no runnable application yet. No Node engine range is specified in the team documents. The TypeScript config currently covers only the supplied shared-type companion.

```sh
cp .env.example .env.local
```

This creates an empty local configuration template, not working credentials. The names come from D2B §15.1: `OPENAI_API_KEY` is also the key implied by D2A's Whisper API choice and registry OQ-004. `AI_SPEND_CAP_USD` is the documented spend-cap setting. D2 specifies 10 AI actions/minute/principal and 30/minute/network but gives no environment-variable names for those rate limits; names await a team decision. This intentionally limited template is not the complete future deployment configuration.

```sh
npm run dev
npm run build
npm start
npm run typecheck
npm test
```

**These steps will not work yet:** every declared npm script prints `not implemented` and exits with status 1. There are no application dependencies or lockfile; `npm ci`, model fetching, seeding, evaluation, smoke checks and Docker setup from D2 are future implementation steps. No packages have been installed for this skeleton.

The schema application command from D2, adjusted to the existing companion path, is:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f docs/code/schema_v2.sql
```

**This will not work until** PostgreSQL 16, pgvector >= 0.8.1, `psql`, credentials and a fresh isolated synthetic database are provisioned. It is not an in-place migration and is not run by this setup. An `.env.local` file alone does not export `DATABASE_URL` into the shell.

See [verification instructions and limits](docs/verification/README.md). The schema runner needs external PGlite packages and writes its JSON report; run it in an isolated copy to preserve delivered evidence. Stored companion results do not establish application acceptance or measured product quality.

## V2 specification documents

The authoritative local package is `docs/`, issued 11 October 2026 (Asia/Dhaka), edition 2.0.

- [Package README](docs/README.md)
- [Team handover](docs/markdown/TEAM_HANDOVER_V2.md)
- [D1: Product requirements](docs/markdown/D1_PRD_V2.md)
- [D2A: Technical contracts and schema](docs/markdown/D2_TRD_PartA_V2.md)
- [D2B: Security, privacy, cost and evaluation](docs/markdown/D2_TRD_PartB_V2.md)
- [Registry and gap check](docs/markdown/00_Gap_Check_and_Registry_V2.md)
- [D3: App flows](docs/markdown/D3_App_Flow_V2.md)
- [D4: Design brief](docs/markdown/D4_Design_Brief_V2.md)
- [D5: Types and ID registry](docs/markdown/D5_Background_Schema_V2.md)
- [D6: Implementation and acceptance plan](docs/markdown/D6_Implementation_Plan_V2.md)
- [D7: Closing pack](docs/markdown/D7_Closing_Pack_V2.md)
- [Manifest](docs/MANIFEST.json)

Keep the three files in `docs/code/` byte-identical to their embedded document versions. Verify SHA-256 against `docs/MANIFEST.json` before using any copy.

## Authors

Sadman Shaharier, Obidit Islam.
