ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_session_id_fkey;

CREATE INDEX IF NOT EXISTS parent_sessions_expires_at_idx ON public.parent_sessions (expires_at);
CREATE INDEX IF NOT EXISTS intake_drafts_expires_at_idx ON public.intake_drafts (expires_at);

CREATE TABLE IF NOT EXISTS public.synthetic_case_seeds (
  record_id uuid PRIMARY KEY,
  case_id uuid NOT NULL UNIQUE REFERENCES public.cases(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION sweep_expired_metadata(p_now timestamptz DEFAULT clock_timestamp())
RETURNS TABLE(deleted_drafts integer, deleted_sessions integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE ai_calls c SET draft_id = NULL
   WHERE c.draft_id IN (
     SELECT d.id FROM intake_drafts d
      WHERE d.expires_at < p_now - interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM ai_reservations r WHERE r.draft_id = d.id AND r.state = 'reserved')
   );
  UPDATE ai_reservations r SET draft_id = NULL
   WHERE r.draft_id IN (
     SELECT d.id FROM intake_drafts d
      WHERE d.expires_at < p_now - interval '1 day'
        AND NOT EXISTS (SELECT 1 FROM ai_reservations active WHERE active.draft_id = d.id AND active.state = 'reserved')
   );
  DELETE FROM intake_drafts d
   WHERE d.expires_at < p_now - interval '1 day'
     AND NOT EXISTS (SELECT 1 FROM ai_reservations r WHERE r.draft_id = d.id AND r.state = 'reserved');
  GET DIAGNOSTICS deleted_drafts = ROW_COUNT;
  DELETE FROM parent_sessions s
   WHERE s.expires_at < p_now - interval '7 days'
     AND NOT EXISTS (SELECT 1 FROM cases c WHERE c.reporter_session_id = s.id);
  GET DIAGNOSTICS deleted_sessions = ROW_COUNT;
  RETURN NEXT;
END $$;

ALTER FUNCTION public.sweep_expired_metadata(timestamptz) OWNER TO fera_owner;
ALTER FUNCTION public.sweep_expired_metadata(timestamptz) SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.sweep_expired_metadata(timestamptz) FROM PUBLIC, fera_app, fera_redactor;
GRANT EXECUTE ON FUNCTION public.sweep_expired_metadata(timestamptz) TO fera_app;
