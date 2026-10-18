-- Fera schema V2.0 - D2A section 7. PostgreSQL 16, pgvector >= 0.8.1.
-- Authors: Sadman Shaharier; Obidit Islam. Date: 11 October 2026, Asia/Dhaka.
-- Fresh synthetic-demo database only. This is not an in-place V1 migration.
-- Rows marked non-synthetic are blocked by cases_synthetic_release_only.
-- Application runtime must use restricted credentials, never the schema owner.
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

-- Enums ---------------------------------------------------------------
CREATE TYPE case_kind        AS ENUM ('missing', 'found');
CREATE TYPE case_status      AS ENUM ('submitted', 'open', 'matched_pending_review', 'confirmed', 'closed', 'referred');
CREATE TYPE sex_t            AS ENUM ('male', 'female', 'other', 'unknown');
CREATE TYPE source_t         AS ENUM ('parent', 'staff', 'public_import', 'synthetic');
CREATE TYPE user_role        AS ENUM ('staff', 'officer', 'admin');
CREATE TYPE candidate_status AS ENUM ('pending', 'confirmed', 'rejected', 'voided', 'superseded');
CREATE TYPE decision_t       AS ENUM ('confirm', 'reject');
CREATE TYPE outcome_t        AS ENUM ('coordination_recorded', 'resolved_outside_fera');
CREATE TYPE duplicate_status AS ENUM ('flagged', 'confirmed_same', 'dismissed');
CREATE TYPE matching_state_t AS ENUM ('queued', 'running', 'complete', 'failed');
CREATE TYPE output_t         AS ENUM ('gd', 'poster', 'helpline');
CREATE TYPE actor_t          AS ENUM ('parent', 'staff', 'officer', 'admin', 'system');

-- Shared trigger: updated_at -----------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Reference data -----------------------------------------------------
CREATE TABLE districts (
  code        smallint PRIMARY KEY CHECK (code BETWEEN 1 AND 64),
  name_en     text NOT NULL UNIQUE,
  name_bn     text NOT NULL UNIQUE,
  division_en text NOT NULL,
  lat         numeric(8,5) NOT NULL CHECK (lat BETWEEN 20 AND 27),
  lng         numeric(8,5) NOT NULL CHECK (lng BETWEEN 88 AND 93)
);

CREATE TABLE district_neighbours (
  district_code  smallint NOT NULL REFERENCES districts(code),
  neighbour_code smallint NOT NULL REFERENCES districts(code),
  PRIMARY KEY (district_code, neighbour_code),
  CHECK (district_code <> neighbour_code)
);

-- Identities ---------------------------------------------------------
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{3,32}$'),
  display_name  text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 80),
  password_hash text NOT NULL,
  role          user_role NOT NULL,
  verified      boolean NOT NULL DEFAULT false,
  district_code smallint REFERENCES districts(code),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (role = 'officer' OR verified = false)
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE parent_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at   timestamptz,
  CHECK (expires_at > created_at)
);

-- Draft metadata (no transcript or case payload before submission) -----
CREATE TABLE intake_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES parent_sessions(id),
  user_id uuid REFERENCES users(id),
  kind case_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  payload_hash text CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  ai_calls_used smallint NOT NULL DEFAULT 0 CHECK (ai_calls_used BETWEEN 0 AND 6),
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  follow_up_round smallint NOT NULL DEFAULT 0 CHECK (follow_up_round BETWEEN 0 AND 4),
  CHECK ((session_id IS NOT NULL) <> (user_id IS NOT NULL)),
  CHECK (expires_at > created_at)
);
-- Active-draft cap (BR-004 / cap query in createDbDraftRegistry): one partial
-- index per principal column, both restricted to the 24-hour window the cap
-- uses. Together they cover the indexable owner-exclusive branches
-- session_id = $1 / user_id = $1 so the cap query is an index scan instead of
-- a seq scan that the old "IS NOT DISTINCT FROM" form would force.
CREATE INDEX intake_drafts_session_id_recent_idx
  ON intake_drafts (session_id, created_at)
  WHERE session_id IS NOT NULL;
CREATE INDEX intake_drafts_user_id_recent_idx
  ON intake_drafts (user_id, created_at)
  WHERE user_id IS NOT NULL;

-- Cases --------------------------------------------------------------
CREATE TABLE cases (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code            text NOT NULL UNIQUE CHECK (ref_code ~ '^[MF]-[0-9A-Z]{6}$'),
  kind                case_kind NOT NULL,
  status              case_status NOT NULL,
  source              source_t NOT NULL,
  source_url          text,
  is_synthetic        boolean NOT NULL DEFAULT true,
  reporter_session_id uuid REFERENCES parent_sessions(id) ON DELETE SET NULL,
  created_by_user_id  uuid REFERENCES users(id),
  raw_text            text CHECK (length(raw_text) <= 4000),
  child_name          text CHECK (length(child_name) <= 80),
  child_name_latin    text CHECK (length(child_name_latin) <= 80),
  age_years           smallint CHECK (age_years BETWEEN 0 AND 17),
  age_min             smallint CHECK (age_min BETWEEN 0 AND 25),
  age_max             smallint CHECK (age_max BETWEEN 0 AND 25),
  sex                 sex_t NOT NULL DEFAULT 'unknown',
  height_cm           smallint CHECK (height_cm BETWEEN 40 AND 220),
  clothing            text CHECK (length(clothing) <= 300),
  marks               text CHECK (length(marks) <= 300),
  circumstances       text CHECK (length(circumstances) <= 500),
  event_at            timestamptz,
  event_at_approx     boolean NOT NULL DEFAULT false,
  event_at_lower      timestamptz,
  event_at_upper      timestamptz,
  provenance          jsonb NOT NULL DEFAULT '{}',
  embedding_model     text,
  embedding_revision  text,
  embedding_space     text,
  matching_state      matching_state_t NOT NULL DEFAULT 'queued',
  matched_at          timestamptz,
  match_error_id      text,
  place_text          text CHECK (length(place_text) <= 200),
  district_code       smallint REFERENCES districts(code),
  thana               text CHECK (length(thana) <= 80),
  reporter_relation   text CHECK (length(reporter_relation) <= 40),
  contact_phone       text CHECK (contact_phone ~ '^01[0-9]{9}$'),
  gd_number           text CHECK (length(gd_number) <= 40),
  embedding           vector(384),
  client_submission_id uuid,
  submission_payload_hash text CHECK (submission_payload_hash ~ '^[0-9a-f]{64}$'),
  input_hash          text CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  version             integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  outcome             outcome_t,
  outcome_note        text CHECK (length(outcome_note) <= 500),
  closed_at           timestamptz,
  anonymised_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cases_synthetic_release_only CHECK (is_synthetic),
  CHECK ((age_min IS NULL) = (age_max IS NULL)),
  CHECK (age_min IS NULL OR age_min <= age_max),
  CHECK (age_years IS NULL OR (age_min IS NOT NULL AND age_min = age_years AND age_max = age_years)),
  CHECK (kind = 'found' OR age_min IS NULL OR age_min <= 17),
  CHECK (event_at_lower IS NULL OR event_at_upper IS NULL OR event_at_lower <= event_at_upper),
  CHECK (event_at IS NULL OR (event_at_lower IS NOT NULL AND event_at_upper IS NOT NULL
         AND event_at BETWEEN event_at_lower AND event_at_upper)),
  CHECK (event_at_approx OR event_at IS NULL OR (event_at = event_at_lower AND event_at = event_at_upper)),
  CHECK (embedding IS NULL OR (embedding_model IS NOT NULL AND embedding_revision IS NOT NULL AND embedding_space IS NOT NULL)),
  CHECK (source <> 'parent' OR anonymised_at IS NOT NULL OR
        (kind = 'missing' AND reporter_session_id IS NOT NULL AND client_submission_id IS NOT NULL
         AND submission_payload_hash IS NOT NULL)),
  CHECK (source <> 'staff' OR anonymised_at IS NOT NULL OR
        (created_by_user_id IS NOT NULL AND client_submission_id IS NOT NULL
         AND submission_payload_hash IS NOT NULL)),
  CHECK (anonymised_at IS NOT NULL OR
        (event_at IS NOT NULL AND event_at_lower IS NOT NULL AND event_at_upper IS NOT NULL
         AND district_code IS NOT NULL AND contact_phone IS NOT NULL AND place_text IS NOT NULL AND length(place_text) >= 1)),
  CHECK (kind <> 'missing' OR anonymised_at IS NOT NULL OR age_min IS NOT NULL),
  CHECK (kind <> 'found' OR anonymised_at IS NOT NULL OR
        length(trim(concat_ws(' ', circumstances, clothing, marks))) >= 3),
  CHECK (kind = 'found' OR age_max IS NULL OR age_max <= 17),
  CHECK (kind = 'missing' OR status NOT IN ('submitted', 'confirmed', 'closed')),
  CHECK (kind = 'found' OR status <> 'referred'),
  CHECK ((ref_code LIKE 'M-%') = (kind = 'missing')),
  CHECK (source <> 'public_import' OR anonymised_at IS NOT NULL OR source_url IS NOT NULL),
  CHECK (source <> 'synthetic' OR is_synthetic),
  CHECK ((status IN ('closed', 'referred')) = (closed_at IS NOT NULL)),
  CHECK (status <> 'closed' OR outcome IS NOT NULL),
  CHECK (anonymised_at IS NULL OR status IN ('closed', 'referred')),
  CHECK (anonymised_at IS NULL OR (child_name IS NULL AND child_name_latin IS NULL
         AND contact_phone IS NULL AND raw_text IS NULL AND place_text IS NULL AND embedding IS NULL
         AND height_cm IS NULL AND clothing IS NULL AND marks IS NULL AND circumstances IS NULL
         AND thana IS NULL AND reporter_relation IS NULL AND gd_number IS NULL AND source_url IS NULL
         AND age_years IS NULL AND outcome_note IS NULL AND reporter_session_id IS NULL
         AND created_by_user_id IS NULL AND input_hash IS NULL AND submission_payload_hash IS NULL
         AND client_submission_id IS NULL AND provenance = '{}'::jsonb
         AND embedding_model IS NULL AND embedding_revision IS NULL AND embedding_space IS NULL)),
  UNIQUE (reporter_session_id, client_submission_id),
  UNIQUE (created_by_user_id, client_submission_id)
);
CREATE TRIGGER cases_updated_at BEFORE UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX cases_kind_status_district_idx ON cases (kind, status, district_code);
CREATE INDEX cases_event_at_idx             ON cases (event_at);
CREATE INDEX cases_session_hash_idx         ON cases (reporter_session_id, input_hash);
-- Optional index; V2 demo matcher uses exact filtered search first.
CREATE INDEX cases_embedding_hnsw_idx       ON cases USING hnsw (embedding vector_cosine_ops);

-- State machine guard (D1 BR-012, BR-013) ------------------------------
CREATE FUNCTION enforce_case_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE step text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.kind = 'missing' AND NEW.status <> 'submitted') OR
       (NEW.kind = 'found' AND NEW.status <> 'open') THEN
      RAISE EXCEPTION 'invalid initial case status' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
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
    -- Redaction may alter only identifying fields; it may not rewrite the lifecycle.
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
CREATE TRIGGER cases_transition_guard BEFORE INSERT OR UPDATE ON cases
  FOR EACH ROW EXECUTE FUNCTION enforce_case_transition();

CREATE TABLE case_versions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id   uuid NOT NULL REFERENCES cases(id),
  version   integer NOT NULL CHECK (version >= 1),
  snapshot  jsonb,
  edited_by actor_t NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (case_id, version)
);

-- Matching -------------------------------------------------------------
CREATE TABLE match_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  missing_case_id uuid NOT NULL REFERENCES cases(id),
  found_case_id   uuid NOT NULL REFERENCES cases(id),
  missing_version integer NOT NULL CHECK (missing_version >= 1),
  found_version   integer NOT NULL CHECK (found_version >= 1),
  score           numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  rank            smallint NOT NULL CHECK (rank BETWEEN 1 AND 5),
  reason_bn       text NOT NULL CHECK (length(reason_bn) <= 200),
  reason_en       text NOT NULL CHECK (length(reason_en) <= 200),
  components      jsonb NOT NULL,
  status          candidate_status NOT NULL DEFAULT 'pending',
  created_at      timestamptz NOT NULL DEFAULT now(),
  decided_at      timestamptz,
  CHECK (missing_case_id <> found_case_id),
  CHECK ((status = 'pending') = (decided_at IS NULL)),
  UNIQUE (missing_case_id, found_case_id, missing_version, found_version)
);
CREATE INDEX match_candidates_missing_status_idx ON match_candidates (missing_case_id, status);
CREATE INDEX match_candidates_found_status_idx   ON match_candidates (found_case_id, status);
CREATE UNIQUE INDEX match_candidates_one_confirmed_missing ON match_candidates (missing_case_id) WHERE status = 'confirmed';
CREATE UNIQUE INDEX match_candidates_one_confirmed_found   ON match_candidates (found_case_id)   WHERE status = 'confirmed';

CREATE TABLE review_decisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL UNIQUE REFERENCES match_candidates(id),
  officer_id   uuid NOT NULL REFERENCES users(id),
  decision     decision_t NOT NULL,
  reason       text CHECK (length(reason) <= 500),
  decided_at   timestamptz NOT NULL DEFAULT now(),
  officer_verified_at_decision boolean NOT NULL DEFAULT true CHECK (officer_verified_at_decision),
  CHECK (decision = 'confirm' OR (reason IS NOT NULL AND length(reason) BETWEEN 3 AND 500))
);

CREATE TABLE referrals (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    uuid NOT NULL UNIQUE REFERENCES match_candidates(id),
  found_case_id   uuid NOT NULL REFERENCES cases(id),
  missing_case_id uuid NOT NULL REFERENCES cases(id),
  agency_name     text NOT NULL DEFAULT 'শিশু সুরক্ষা সেবা' CHECK (length(agency_name) <= 120),
  referred_by     uuid NOT NULL REFERENCES users(id),
  referred_at     timestamptz NOT NULL DEFAULT now(),
  record_state    text NOT NULL DEFAULT 'recorded' CHECK (record_state = 'recorded'),
  is_simulated    boolean NOT NULL DEFAULT true CHECK (is_simulated),
  note            text CHECK (length(note) <= 500)
);

CREATE TABLE duplicate_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_a      uuid NOT NULL REFERENCES cases(id),
  case_b      uuid NOT NULL REFERENCES cases(id),
  score       numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  rule        text NOT NULL CHECK (rule IN ('profile', 'same_phone')),
  status      duplicate_status NOT NULL DEFAULT 'flagged',
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  reason      text CHECK (length(reason) <= 500),
  CHECK (case_a < case_b),
  CHECK (rule <> 'same_phone' OR status <> 'confirmed_same'),
  CHECK ((status = 'flagged') = (resolved_at IS NULL)),
  CHECK ((status = 'flagged') = (resolved_by IS NULL)),
  CHECK (status = 'flagged' OR (reason IS NOT NULL AND length(reason) >= 3)),
  UNIQUE (case_a, case_b)
);

-- Outputs, audit, usage, limits ----------------------------------------
CREATE TABLE generated_outputs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      uuid NOT NULL REFERENCES cases(id),
  type         output_t NOT NULL,
  text_bn      text CHECK (length(text_bn) <= 3000),
  case_version integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX generated_outputs_version_idx ON generated_outputs (case_id, type, case_version);
CREATE INDEX generated_outputs_case_type_idx ON generated_outputs (case_id, type);

CREATE TABLE audit_log (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at                timestamptz NOT NULL DEFAULT now(),
  actor_type        actor_t NOT NULL,
  actor_user_id     uuid REFERENCES users(id),
  actor_session_id  uuid REFERENCES parent_sessions(id),
  action            text NOT NULL CHECK (action ~ '^[a-z_.]{3,60}$'),
  case_id           uuid REFERENCES cases(id),
  candidate_id      uuid REFERENCES match_candidates(id),
  details           jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id        text
);
CREATE INDEX audit_log_case_idx ON audit_log (case_id, at);

CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only' USING ERRCODE = 'insufficient_privilege';
END $$;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();
CREATE TRIGGER audit_log_no_update_delete BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

-- Atomic global budget reservations; failed/uncertain provider calls still count.
CREATE TABLE ai_budget (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  cap_usd numeric(10,6) NOT NULL DEFAULT 25 CHECK (cap_usd > 0 AND cap_usd <= 30),
  committed_usd numeric(10,6) NOT NULL DEFAULT 0 CHECK (committed_usd >= 0),
  reserved_usd numeric(10,6) NOT NULL DEFAULT 0 CHECK (reserved_usd >= 0),
  CHECK (committed_usd + reserved_usd <= cap_usd)
);
INSERT INTO ai_budget (id) VALUES (true);
CREATE TABLE ai_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES intake_drafts(id),
  reserved_usd numeric(10,6) NOT NULL CHECK (reserved_usd >= 0),
  actual_usd numeric(10,6) CHECK (actual_usd >= 0),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved','settled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  CHECK ((state = 'settled') = (settled_at IS NOT NULL)),
  CHECK ((state = 'settled') = (actual_usd IS NOT NULL))
);

CREATE TABLE ai_calls (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  draft_id      uuid REFERENCES intake_drafts(id),
  case_id       uuid REFERENCES cases(id),
  reservation_id uuid UNIQUE REFERENCES ai_reservations(id),
  request_id    text,
  operation     text NOT NULL CHECK (operation IN ('transcribe', 'extract', 'embed')),
  provider      text NOT NULL,
  model         text NOT NULL,
  duration_ms   integer NOT NULL CHECK (duration_ms >= 0),
  input_units   integer,
  output_units  integer,
  est_cost_usd  numeric(10,6) NOT NULL DEFAULT 0 CHECK (est_cost_usd >= 0),
  cache_hit     boolean NOT NULL DEFAULT false,
  ok            boolean NOT NULL,
  error_id      text CHECK (error_id ~ '^E-[0-9]{3}$')
);
CREATE INDEX ai_calls_at_idx ON ai_calls (at);

CREATE TABLE rate_limits (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (key, window_start)
);

-- Relationship and decision checks are deferred until the transaction is complete.
CREATE FUNCTION check_pair_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
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
        AND a.action=('match.' || d.decision::text)) THEN
    RAISE EXCEPTION 'review decision requires matching officer audit event' USING ERRCODE='check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER candidates_integrity AFTER INSERT OR UPDATE ON match_candidates
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_pair_integrity();
CREATE CONSTRAINT TRIGGER decisions_integrity AFTER INSERT OR UPDATE ON review_decisions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_pair_integrity();
CREATE CONSTRAINT TRIGGER referrals_integrity AFTER INSERT OR UPDATE ON referrals
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_pair_integrity();
CREATE CONSTRAINT TRIGGER cases_integrity AFTER INSERT OR UPDATE ON cases
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_pair_integrity();

CREATE FUNCTION verify_decision_author() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.officer_id AND role='officer' AND verified AND is_active) THEN
    RAISE EXCEPTION 'decision author must be an active verified officer' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER decisions_author BEFORE INSERT ON review_decisions
  FOR EACH ROW EXECUTE FUNCTION verify_decision_author();

CREATE FUNCTION lock_decision_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.reason='[REDACTED]' AND
     (to_jsonb(NEW)-'reason')=(to_jsonb(OLD)-'reason') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'decision history is immutable; use an audited correction workflow before a pilot'
    USING ERRCODE='insufficient_privilege';
END $$;
CREATE TRIGGER decisions_history BEFORE UPDATE OR DELETE ON review_decisions
  FOR EACH ROW EXECUTE FUNCTION lock_decision_history();

CREATE FUNCTION protect_confirmed_candidate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status='confirmed' THEN
    IF TG_OP='UPDATE' AND NEW.reason_bn='[REDACTED]' AND NEW.reason_en='[REDACTED]'
       AND NEW.components='{}'::jsonb AND
       (to_jsonb(NEW)-ARRAY['reason_bn','reason_en','components'])=
       (to_jsonb(OLD)-ARRAY['reason_bn','reason_en','components']) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'confirmed pair history is locked except payload redaction' USING ERRCODE='check_violation';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER confirmed_candidate_lock BEFORE UPDATE OR DELETE ON match_candidates
  FOR EACH ROW EXECUTE FUNCTION protect_confirmed_candidate();

CREATE FUNCTION lock_referral_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.note IS NULL AND
     (to_jsonb(NEW)-'note')=(to_jsonb(OLD)-'note') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'referral history is immutable except note redaction' USING ERRCODE='insufficient_privilege';
END $$;
CREATE TRIGGER referrals_history BEFORE UPDATE OR DELETE ON referrals
  FOR EACH ROW EXECUTE FUNCTION lock_referral_history();

CREATE FUNCTION check_duplicate_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE a cases; b cases;
BEGIN
  SELECT * INTO a FROM cases WHERE id=NEW.case_a;
  SELECT * INTO b FROM cases WHERE id=NEW.case_b;
  IF a.kind<>b.kind THEN RAISE EXCEPTION 'duplicate reports must have same kind' USING ERRCODE='check_violation'; END IF;
  IF NEW.status<>'flagged' AND NOT EXISTS (
      SELECT 1 FROM users WHERE id=NEW.resolved_by AND role='officer' AND verified AND is_active) THEN
    RAISE EXCEPTION 'duplicate resolution requires verified officer' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER duplicate_integrity BEFORE INSERT OR UPDATE ON duplicate_links
  FOR EACH ROW EXECUTE FUNCTION check_duplicate_integrity();

-- Reserve upper-bound provider cost before dispatch. Identity/expiry is checked in API.
-- No refunds to the per-draft count: dispatched retries/fallbacks each consume a call.
CREATE FUNCTION reserve_ai_call(p_draft uuid, p_upper_usd numeric) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE rid uuid;
BEGIN
  IF p_upper_usd IS NULL OR p_upper_usd<=0 THEN RAISE EXCEPTION 'positive cost upper bound required'; END IF;
  -- Global lock order: budget first, then draft; settlement uses budget then reservation.
  PERFORM 1 FROM ai_budget WHERE id=true FOR UPDATE;
  IF p_draft IS NOT NULL THEN
    UPDATE intake_drafts SET ai_calls_used=ai_calls_used+1,revision=revision+1
      WHERE id=p_draft AND expires_at>now() AND ai_calls_used<6;
    IF NOT FOUND THEN RAISE EXCEPTION 'draft expired or six-call limit reached' USING ERRCODE='check_violation'; END IF;
  END IF;
  UPDATE ai_budget SET reserved_usd=reserved_usd+p_upper_usd
    WHERE id=true AND committed_usd+reserved_usd+p_upper_usd<=cap_usd;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI budget exhausted' USING ERRCODE='check_violation'; END IF;
  INSERT INTO ai_reservations(draft_id,reserved_usd) VALUES(p_draft,p_upper_usd) RETURNING id INTO rid;
  RETURN rid;
END $$;

CREATE FUNCTION settle_ai_call(p_reservation uuid,p_actual_usd numeric) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r ai_reservations;
BEGIN
  PERFORM 1 FROM ai_budget WHERE id=true FOR UPDATE;
  SELECT * INTO r FROM ai_reservations WHERE id=p_reservation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation not found'; END IF;
  IF r.state='settled' THEN
    IF r.actual_usd IS DISTINCT FROM p_actual_usd THEN RAISE EXCEPTION 'settlement conflicts with prior result'; END IF;
    RETURN;
  END IF;
  IF p_actual_usd IS NULL OR p_actual_usd<0 OR p_actual_usd>r.reserved_usd THEN
    RAISE EXCEPTION 'actual cost exceeds reserved upper bound';
  END IF;
  UPDATE ai_budget SET reserved_usd=reserved_usd-r.reserved_usd,committed_usd=committed_usd+p_actual_usd WHERE id=true;
  UPDATE ai_reservations SET state='settled',actual_usd=p_actual_usd,settled_at=now() WHERE id=p_reservation;
END $$;

-- Clearing identifying payloads is pseudonymisation, not irreversible anonymity.
CREATE FUNCTION redact_case(p_case uuid,p_admin uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rec cases;
BEGIN
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

-- Issue the next follow-up question. Atomic: increments follow_up_round and
-- revision only while the row's revision matches `expected_revision`, the row
-- has not expired, and the round cap has not been reached. Returns the new
-- revision on success or NULL when any guard refuses the move; no counter
-- is changed on the refused path. The function runs as fera_owner so callers
-- hold EXECUTE instead of an UPDATE grant on intake_drafts.
CREATE FUNCTION issue_intake_question(p_draft uuid, p_expected_revision int) RETURNS int LANGUAGE plpgsql AS $$
DECLARE new_rev int;
BEGIN
  UPDATE intake_drafts
     SET follow_up_round = follow_up_round + 1,
         revision = revision + 1
   WHERE id = p_draft
     AND revision = p_expected_revision
     AND expires_at > now()
     AND follow_up_round < 4
   RETURNING revision INTO new_rev;
  RETURN new_rev;
END $$;

-- Set the canonical 64-hex payload hash and advance the revision under the
-- same expected/expiry guard. Refusal leaves both columns unchanged. Metadata
-- only: the function never touches payload, text or token columns.
CREATE FUNCTION set_intake_payload_hash(p_draft uuid, p_expected_revision int, p_hash text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE new_rev int;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'payload hash must be 64 lowercase hex characters' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE intake_drafts
     SET payload_hash = p_hash,
         revision = revision + 1
   WHERE id = p_draft
     AND revision = p_expected_revision
     AND expires_at > now()
   RETURNING revision INTO new_rev;
  RETURN new_rev;
END $$;

REVOKE UPDATE,DELETE,TRUNCATE ON audit_log FROM PUBLIC;
REVOKE ALL ON FUNCTION redact_case(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION reserve_ai_call(uuid,numeric),settle_ai_call(uuid,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_intake_question(uuid,int), set_intake_payload_hash(uuid,int,text) FROM PUBLIC;
-- Hosting operator must grant service functions to separate restricted runtime roles.
-- No application role may own tables, create/alter schema, disable triggers, or truncate.
COMMIT;
