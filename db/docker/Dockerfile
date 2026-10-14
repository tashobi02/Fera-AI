# Local PostgreSQL 16 + pgvector for Fera (TASK-002). Built on the official image so
# no third-party image pull is needed: npm run db:up
# Base pinned to the multi-arch index digest of postgres:16-alpine (16.15, alpine 3.24) so the
# clang21/llvm21 build packages below stay consistent with the image.
FROM postgres:16-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685
ARG PGVECTOR_VERSION=v0.8.1
# Commit of the upstream v0.8.1 tag; the build fails if the tag ever points elsewhere.
ARG PGVECTOR_COMMIT=778dacf20c07caf904557a88705142631818d8cb
RUN apk add --no-cache --virtual .build git build-base clang21 llvm21 \
 && git clone --depth 1 --branch ${PGVECTOR_VERSION} https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && test "$(git -C /tmp/pgvector rev-parse HEAD)" = "${PGVECTOR_COMMIT}" \
 && cd /tmp/pgvector && make OPTFLAGS="" && make install \
 && cd / && rm -rf /tmp/pgvector && apk del .build
