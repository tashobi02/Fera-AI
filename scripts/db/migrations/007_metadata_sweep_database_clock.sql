-- The runtime role may request a bounded sweep, but may not choose the cutoff.
-- A caller-supplied future timestamp would otherwise let SECURITY DEFINER delete
-- live drafts and sessions. Keep the current time private to the function.
DROP FUNCTION IF EXISTS public.sweep_expired_metadata(timestamptz);

CREATE OR REPLACE FUNCTION public.sweep_expired_metadata()
RETURNS TABLE(deleted_drafts integer, deleted_sessions integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  p_now timestamptz := clock_timestamp();
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

ALTER FUNCTION public.sweep_expired_metadata() OWNER TO fera_owner;
ALTER FUNCTION public.sweep_expired_metadata() SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.sweep_expired_metadata() FROM PUBLIC, fera_app, fera_redactor;
GRANT EXECUTE ON FUNCTION public.sweep_expired_metadata() TO fera_app;

CREATE INDEX IF NOT EXISTS ai_reservations_draft_state_idx
  ON public.ai_reservations (draft_id, state) WHERE draft_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_calls_draft_id_idx
  ON public.ai_calls (draft_id) WHERE draft_id IS NOT NULL;
