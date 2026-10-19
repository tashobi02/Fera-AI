DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'audit_action_t') THEN
    CREATE TYPE public.audit_action_t AS ENUM (
      'match.confirm', 'match.reject', 'case.payload_redacted', 'access.denied',
      'case.created', 'case.imported', 'case.submission_replayed', 'case.state_changed',
      'case.edited', 'case.closed', 'case.contact_viewed', 'match.voided',
      'referral.recorded', 'duplicate.reviewed', 'duplicate.flagged', 'match.refused',
      'case.close.refused', 'case.edit.refused', 'user.verification_changed', 'case.close'
    );
  END IF;
END $$;

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE public.audit_log ALTER COLUMN action TYPE public.audit_action_t USING action::public.audit_action_t;

CREATE OR REPLACE FUNCTION check_pair_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c match_candidates; m cases; f cases; d review_decisions; r referrals;
        cid uuid;
BEGIN
  IF TG_TABLE_NAME = 'cases' THEN
    SELECT * INTO m FROM cases WHERE id=NEW.id;
    IF EXISTS (SELECT 1 FROM match_candidates p JOIN cases x ON x.id=p.missing_case_id
        JOIN cases y ON y.id=p.found_case_id
        WHERE (p.missing_case_id=m.id OR p.found_case_id=m.id) AND p.status='pending'
        AND (p.missing_version<>x.version OR p.found_version<>y.version
          OR x.status NOT IN ('open','matched_pending_review')
          OR y.status NOT IN ('open','matched_pending_review'))) THEN
      RAISE EXCEPTION 'case update leaves an ineligible or stale pending candidate' USING ERRCODE='check_violation';
    END IF;
    IF m.status='matched_pending_review' AND NOT EXISTS (
        SELECT 1 FROM match_candidates p WHERE p.status='pending'
          AND (p.missing_case_id=m.id OR p.found_case_id=m.id)) THEN
      RAISE EXCEPTION 'pending-review case requires a pending candidate' USING ERRCODE='check_violation';
    END IF;
    IF m.status = 'confirmed' AND NOT EXISTS (
      SELECT 1 FROM match_candidates WHERE missing_case_id=NEW.id AND status='confirmed') THEN
      RAISE EXCEPTION 'confirmed case requires confirmed candidate' USING ERRCODE='check_violation';
    END IF;
    IF m.status = 'referred' AND NOT EXISTS (
      SELECT 1 FROM match_candidates WHERE found_case_id=NEW.id AND status='confirmed') THEN
      RAISE EXCEPTION 'referral-recorded case requires confirmed candidate' USING ERRCODE='check_violation';
    END IF;
    IF m.status='closed' AND m.outcome='coordination_recorded' AND NOT EXISTS (
      SELECT 1 FROM match_candidates WHERE missing_case_id=NEW.id AND status='confirmed') THEN
      RAISE EXCEPTION 'coordination closure requires confirmed pair' USING ERRCODE='check_violation';
    END IF;
    RETURN NULL;
  END IF;
  IF TG_TABLE_NAME='match_candidates' THEN cid:=NEW.id;
  ELSE cid:=NEW.candidate_id; END IF;
  SELECT * INTO c FROM match_candidates WHERE id=cid;
  SELECT * INTO m FROM cases WHERE id=c.missing_case_id;
  SELECT * INTO f FROM cases WHERE id=c.found_case_id;
  IF m.kind <> 'missing' OR f.kind <> 'found' THEN
    RAISE EXCEPTION 'candidate endpoint kinds are invalid' USING ERRCODE='check_violation';
  END IF;
  IF c.status='pending' AND (m.version<>c.missing_version OR f.version<>c.found_version OR
      m.status NOT IN ('open','matched_pending_review') OR f.status NOT IN ('open','matched_pending_review') OR
      m.anonymised_at IS NOT NULL OR f.anonymised_at IS NOT NULL) THEN
    RAISE EXCEPTION 'pending candidate must use eligible current versions' USING ERRCODE='check_violation';
  END IF;
  SELECT * INTO d FROM review_decisions WHERE candidate_id=cid;
  SELECT * INTO r FROM referrals WHERE candidate_id=cid;
  IF d.id IS NOT NULL AND ((d.decision='confirm' AND c.status<>'confirmed') OR
      (d.decision='reject' AND c.status<>'rejected')) THEN
    RAISE EXCEPTION 'decision must agree with candidate status' USING ERRCODE='check_violation';
  END IF;
  IF c.status='rejected' AND (d.id IS NULL OR d.decision<>'reject') THEN
    RAISE EXCEPTION 'rejected candidate requires rejection decision' USING ERRCODE='check_violation';
  END IF;
  IF r.id IS NOT NULL AND (r.missing_case_id<>c.missing_case_id OR r.found_case_id<>c.found_case_id OR
      c.status<>'confirmed' OR r.referred_by<>d.officer_id) THEN
    RAISE EXCEPTION 'referral must describe its confirmed candidate and author' USING ERRCODE='check_violation';
  END IF;
  IF c.status='confirmed' AND (d.id IS NULL OR d.decision<>'confirm' OR r.id IS NULL OR
      m.version<>c.missing_version OR f.version<>c.found_version OR
      m.status NOT IN ('confirmed','closed') OR f.status<>'referred') THEN
    RAISE EXCEPTION 'confirmed pair requires decision, referral record, and both final states' USING ERRCODE='check_violation';
  END IF;
  IF d.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM audit_log a
      WHERE a.candidate_id=cid AND a.actor_type='officer' AND a.actor_user_id=d.officer_id
        AND a.action::text=('match.' || d.decision::text)) THEN
    RAISE EXCEPTION 'review decision requires matching officer audit event' USING ERRCODE='check_violation';
  END IF;
  RETURN NULL;
END $$;
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS is_synthetic boolean NOT NULL DEFAULT true;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.audit_log'::regclass
       AND conname = 'audit_log_is_synthetic_true_check'
  ) THEN
    ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_is_synthetic_true_check CHECK (is_synthetic) NOT VALID;
    ALTER TABLE public.audit_log VALIDATE CONSTRAINT audit_log_is_synthetic_true_check;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS audit_log_at_idx ON public.audit_log (at);
CREATE INDEX IF NOT EXISTS audit_log_actor_user_at_idx ON public.audit_log (actor_user_id, at);
CREATE INDEX IF NOT EXISTS audit_log_action_at_idx ON public.audit_log (action, at);
CREATE INDEX IF NOT EXISTS audit_log_request_id_idx ON public.audit_log (request_id) WHERE request_id IS NOT NULL;
