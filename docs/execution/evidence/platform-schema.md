# TASK-002 evidence — schema on PostgreSQL 16 + pgvector

Owner: Mahim · Lane: `mahim-db` (Claude Code) · Date: 2026-10-14 (Asia/Dhaka) · Links: TASK-002, TC-062, DEP-008, OQ-021, D2 Part A §7/7.1, A-034.

## Local — done

| Item | Value |
|---|---|
| Runtime | Docker 29.4.0, image `fera-pg16-pgvector:0.8.1` built from `db/docker/Dockerfile` (official `postgres:16-alpine` + pgvector v0.8.1 from source). The prebuilt `pgvector/pgvector:pg16` pull failed repeatedly (registry CDN EOF) and Supabase's local stack needs ~2–3 GB of images on a disk with ~2 GB free, so the local stack is this single container. |
| Address | `127.0.0.1:54322` (bound to loopback only), database `fera` |
| `SHOW server_version` | `16.15` |
| `pg_extension` | `plpgsql 1.0, vector 0.8.1` (A-034: pgvector ≥ 0.8.1 ✔) |
| HNSW indexes | `cases_embedding_hnsw_idx` |
| Public base tables | 17 |
| `db/schema_v2.sql` SHA-256 | `3fe345b1e7658657ff0c1de1afd76456e3dcd55159326bb23e3c1d94d913bf67` (byte-identical to `docs/code/schema_v2.sql`; `db:reset` refuses to run if they differ) |

Commands (fresh checkout):

```bash
npm run db:up      # build/start fera-db on 127.0.0.1:54322
npm run db:reset   # drop + recreate `fera`, apply db/schema_v2.sql, print the checks above
```

Observed: first `db:reset` exit 0 (schema applied to a fresh database, no errors); second run exit 0 (idempotent drop/recreate). `DATABASE_URL=postgresql://…@db.example.supabase.co…` → `db:reset refuses a non-local database host`, exit 1. Guard unit tests: `tests/db/reset-guard.test.ts` (13 cases). No credentials are written to any committed file; the local `postgres/postgres` password is the container default for synthetic dev data only.

## Hosted — NOT done

Hosted host: Supabase project set up by Obidit (per Mahim, 14 Oct). Its connection details are in a local `.env.local` that agents do not read. Whether `schema_v2.sql` is already applied there, and its `server_version`/pgvector version, are **UNKNOWN**. Applying it changes a shared team database, so it needs Mahim's/Obidit's explicit go-ahead; `db:reset` is local-only by design. Note `supabase/config.toml` pins `major_version = 16` for the Supabase CLI local stack; the hosted project's major version must also be 16 (D2 Part A OQ-021 condition: `CREATE EXTENSION vector` + HNSW on the host).

## Not yet covered (TASK-062)

Restricted runtime role, grants, lifecycle/invariant negative tests and redaction checks run against this local database in TASK-062.
