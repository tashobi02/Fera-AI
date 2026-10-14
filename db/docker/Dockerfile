# Local PostgreSQL 16 + pgvector for Fera (TASK-002). Built on the official image so
# no third-party image pull is needed: npm run db:up
FROM postgres:16-alpine
ARG PGVECTOR_VERSION=v0.8.1
RUN apk add --no-cache --virtual .build git build-base clang21 llvm21 \
 && git clone --depth 1 --branch ${PGVECTOR_VERSION} https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && cd /tmp/pgvector && make OPTFLAGS="" && make install \
 && cd / && rm -rf /tmp/pgvector && apk del .build
