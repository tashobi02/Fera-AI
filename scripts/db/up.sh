#!/usr/bin/env bash
# Local dev database: PostgreSQL 16 + pgvector 0.8.1 on 127.0.0.1:54322 (TASK-002).
# Synthetic data only. Then run `npm run db:reset` to apply db/schema_v2.sql.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
image="fera-pg16-pgvector:0.8.1"
# Rebuild with `docker rmi fera-pg16-pgvector:0.8.1` after changing db/docker/Dockerfile.
docker image inspect "$image" >/dev/null 2>&1 || docker build -t "$image" db/docker
if docker container inspect fera-db >/dev/null 2>&1; then
  docker start fera-db >/dev/null
else
  docker run -d --name fera-db -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:54322:5432 \
    -v fera-db-data:/var/lib/postgresql/data "$image" >/dev/null
fi
# TCP check: the entrypoint's temporary init server listens on the socket only.
for _ in $(seq 1 60); do
  docker exec fera-db pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec fera-db pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 || { echo "fera-db did not become ready" >&2; exit 1; }
echo "fera-db ready on 127.0.0.1:54322 (local only). Next: npm run db:reset"
