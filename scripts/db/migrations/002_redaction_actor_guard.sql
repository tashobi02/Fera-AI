CREATE OR REPLACE FUNCTION enforce_case_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE step text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.kind = 'missing' AND NEW.status <> 'submitted') OR
       (NEW.kind = 'found' AND NEW.status <> 'open') THEN
      RAISE EXCEPTION 'invalid initial case status' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF NEW.anonymised_at IS NOT NULL AND OLD.anonymised_at IS NULL
       AND current_setting('fera.redacting', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'anonymised_at may only be set by redact_case' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.kind <> OLD.kind THEN
      RAISE EXCEPTION 'case kind is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.anonymised_at IS NOT NULL AND
       (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'redacted case is immutable' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status IN ('confirmed','closed','referred') AND NEW.anonymised_at IS NULL AND
       (to_jsonb(NEW) - ARRAY['status','closed_at','outcome','outcome_note','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','closed_at','outcome','outcome_note','updated_at']) THEN
      RAISE EXCEPTION 'terminal report fields are locked' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status IN ('closed','referred') AND NEW.anonymised_at IS NULL AND
       (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
      RAISE EXCEPTION 'terminal outcome is locked' USING ERRCODE = 'check_violation';
    END IF;
    step := OLD.status::text || '>' || NEW.status::text;
    IF NEW.status <> OLD.status AND NOT (
      (OLD.kind = 'missing' AND step = ANY (ARRAY[
      'submitted>open','open>matched_pending_review','matched_pending_review>open',
      'matched_pending_review>confirmed','confirmed>closed','open>closed'])) OR
      (OLD.kind = 'found' AND step = ANY (ARRAY[
      'open>matched_pending_review','matched_pending_review>open','matched_pending_review>referred']))
    ) THEN
      RAISE EXCEPTION 'illegal transition % for % case', step, OLD.kind USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.anonymised_at IS NOT NULL AND OLD.anonymised_at IS NULL AND
       (NEW.status <> OLD.status OR NEW.outcome IS DISTINCT FROM OLD.outcome OR
        NEW.closed_at IS DISTINCT FROM OLD.closed_at OR NEW.kind <> OLD.kind OR
        NEW.ref_code <> OLD.ref_code OR NEW.district_code IS DISTINCT FROM OLD.district_code OR
        NEW.event_at IS DISTINCT FROM OLD.event_at OR NEW.sex <> OLD.sex) THEN
      RAISE EXCEPTION 'redaction must preserve aggregate lifecycle fields' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.anonymised_at IS NULL AND NEW.event_at_lower > clock_timestamp() THEN
    RAISE EXCEPTION 'event interval starts in future' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION redact_case(p_case uuid,p_admin uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE rec cases;
BEGIN
  IF current_setting('fera.redaction_actor_id', true) IS DISTINCT FROM p_admin::text THEN
    RAISE EXCEPTION 'redaction calling admin must match p_admin' USING ERRCODE='insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=p_admin AND role='admin' AND is_active) THEN
    RAISE EXCEPTION 'redaction requires active admin' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT * INTO rec FROM cases WHERE id=p_case FOR UPDATE;
  IF NOT FOUND OR rec.status NOT IN ('closed','referred') THEN RAISE EXCEPTION 'case not eligible for redaction'; END IF;
  IF rec.kind='found' AND EXISTS (SELECT 1 FROM match_candidates mc JOIN cases m ON m.id=mc.missing_case_id
      WHERE mc.found_case_id=p_case AND mc.status='confirmed' AND m.status<>'closed') THEN
    RAISE EXCEPTION 'retain found evidence until linked missing report is closed';
  END IF;
  IF rec.anonymised_at IS NOT NULL THEN RETURN; END IF;
  PERFORM set_config('fera.redacting', '1', true);
  UPDATE cases SET child_name=NULL,child_name_latin=NULL,age_years=NULL,
    age_min=CASE WHEN age_min IS NULL THEN NULL ELSE 2*(age_min/2) END,
    age_max=CASE WHEN age_max IS NULL THEN NULL ELSE least(25,2*(age_max/2)+1) END,
    height_cm=NULL,clothing=NULL,marks=NULL,circumstances=NULL,contact_phone=NULL,
    raw_text=NULL,place_text=NULL,thana=NULL,reporter_relation=NULL,gd_number=NULL,source_url=NULL,
    outcome_note=NULL,reporter_session_id=NULL,created_by_user_id=NULL,input_hash=NULL,
    submission_payload_hash=NULL,client_submission_id=NULL,embedding=NULL,
    embedding_model=NULL,embedding_revision=NULL,embedding_space=NULL,provenance='{}',anonymised_at=now()
    WHERE id=p_case;
  UPDATE case_versions SET snapshot=NULL WHERE case_id=p_case;
  DELETE FROM generated_outputs WHERE case_id=p_case;
  UPDATE match_candidates SET reason_bn='[REDACTED]',reason_en='[REDACTED]',components='{}'
    WHERE missing_case_id=p_case OR found_case_id=p_case;
  UPDATE review_decisions SET reason='[REDACTED]' WHERE candidate_id IN (
    SELECT id FROM match_candidates WHERE missing_case_id=p_case OR found_case_id=p_case);
  UPDATE referrals SET note=NULL WHERE missing_case_id=p_case OR found_case_id=p_case;
  UPDATE duplicate_links SET reason='[REDACTED]' WHERE case_a=p_case OR case_b=p_case;
  INSERT INTO audit_log(actor_type,actor_user_id,action,case_id,details)
    VALUES('admin',p_admin,'case.payload_redacted',p_case,'{"mode":"pseudonymisation","external_copies_removed":false}');
END $$;
