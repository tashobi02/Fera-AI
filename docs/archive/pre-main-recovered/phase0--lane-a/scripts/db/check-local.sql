-- TASK-002 bootstrap check, schema owner only in an isolated synthetic DB.
\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 16 THEN
    RAISE EXCEPTION 'PostgreSQL 16 required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector'
    AND string_to_array(extversion, '.')::integer[] >= ARRAY[0,8,1]) THEN
    RAISE EXCEPTION 'pgvector >= 0.8.1 required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    JOIN pg_am a ON a.oid=c.relam WHERE i.indrelid='public.cases'::regclass
    AND i.indisvalid AND c.relname='cases_embedding_hnsw_idx' AND a.amname='hnsw') THEN
    RAISE EXCEPTION 'Valid cases HNSW index required';
  END IF;
END $$;
SELECT current_setting('server_version') AS postgres_version;
SELECT extversion FROM pg_extension WHERE extname='vector';
SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
  AND tablename='cases' AND indexname='cases_embedding_hnsw_idx';
SELECT count(*) AS district_rows FROM districts;
