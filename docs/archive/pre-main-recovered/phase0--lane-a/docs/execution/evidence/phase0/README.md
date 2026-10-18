# Phase 0 bootstrap evidence

Lane: phase0--lane-a at <lanes>/lane-a, based on local main 1c1ec6c. One writer holds all three roles; tracker owners remain Mahim, Obidit and Masnun.

## TASK-001 dependencies

Scaffold command: `npx --yes create-next-app@latest /tmp/fera-phase0-scaffold --ts --tailwind --eslint --app --src-dir --import-alias '@/*' --use-npm --disable-git --yes`, exit 0. Scaffold generated Next 16.4.0, React 19.3.0 and Tailwind 4; locked exact installed versions are in package-lock.json. Primary CLI source: https://nextjs.org/docs/app/api-reference/cli/create-next-app .

New dependencies are scaffold tooling/runtime (Next, React, React DOM, TypeScript, ESLint/config, Tailwind/compiler, Node/React types) and Vitest for bootstrap regression tests. Node types were aligned to 22 after a peer conflict; no force/legacy-peer-deps was used. Tests failed on all three original skeleton invariants, then passed after merging. These three tests are bootstrap checks, not the TASK-037 60-unit-test target or app journey acceptance.

Product routes, accounts, auth, AI adapters and reporting flows are absent. Root page is a bilingual synthetic scaffold placeholder; locale copy is separate. Fonts and visual system belong to TASK-008; no font/model download was performed.

## External blockers

`gh auth status` exit 1: configured GitHub token invalid. CI run URL UNKNOWN; no push/merge or remote run initiated. Preview URL UNKNOWN: no Vercel CLI, project metadata, VERCEL_TOKEN or supplied hosting session. GitHub/Vercel account existence beyond this observation is UNKNOWN.

## TASK-002 local database

Docker daemon 29.8.2 was accessible with elevated permissions; `docker compose` is unavailable. Local check used a dedicated container with `--network none`, no host ports, and trust auth confined to that container. No password or DATABASE_URL was created or printed. This is a schema-owner bootstrap check, not restricted application-role or lifecycle acceptance (TASK-062).

Image: `pgvector/pgvector:0.8.1-pg16@sha256:33198da2828a14c30348d2ccb4750833d5ed9a44c88d840a0e523d7417120337`. Source: https://github.com/pgvector/pgvector .

Commands:
```
docker run -d --name fera-phase0-lane-a-pg16 --network none -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=fera_phase0 pgvector/pgvector:0.8.1-pg16@sha256:33198da2828a14c30348d2ccb4750833d5ed9a44c88d840a0e523d7417120337
docker exec -i fera-phase0-lane-a-pg16 psql -U postgres -d fera_phase0 -v ON_ERROR_STOP=1 < db/schema_v2.sql
docker exec -i fera-phase0-lane-a-pg16 psql -U postgres -d fera_phase0 < scripts/db/check-local.sql
sha256sum db/schema_v2.sql docs/code/schema_v2.sql
```
Apply exit 0: local-schema-apply.txt. PG16.12, vector 0.8.1, valid cases_embedding_hnsw_idx: local-schema-check.txt. Schema SHA-256: 3fe345b1e7658657ff0c1de1afd76456e3dcd55159326bb23e3c1d94d913bf67 for both files.

OQ-021 remains human-owned. Options are a managed PG16 service that supports pgvector >=0.8.1/HNSW, or a team-operated PG16 host; no service is selected. Host/account/limits/costs are UNKNOWN and hosted schema is unapplied.

## Other task blockers

TASK-003: docs/costs.md; no keys/calls, prices UNVERIFIED. TASK-005: TASK-003 incomplete and no three phone recording paths supplied/found among tracked files; no transcription. TASK-004: embedding-blocker.md, dependency incomplete, no weights downloaded. TASK-009: TASK-002 incomplete; source pack specifies 64 rows but supplies no complete cited rows/centroids/neighbour data. Seed remains a fail-fast stub; local count is 0. No invented reference data is loaded.

KIT: `git merge-base --is-ancestor 648a60e main` exit 0 and `git show -s 648a60e` confirms commit. `git ls-files CLAUDE.md AGENTS.md CODEX.md .claude .codex .agents .specify docs/agents docs/execution | wc -l` = 247; G0 subset without CODEX/docs = 236. These counts replace the older 234; laptop bootstrap and owner ratification/runtime discovery are UNKNOWN. bootstrap.sh was not run.

Captured text logs have trailing whitespace and excess final blank lines normalized; substantive command output is unchanged.
