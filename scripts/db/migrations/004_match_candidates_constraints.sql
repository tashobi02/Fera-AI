DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.match_candidates'::regclass
       AND conname = 'match_candidates_endpoints_not_null'
  ) THEN
    ALTER TABLE public.match_candidates
      ADD CONSTRAINT match_candidates_endpoints_not_null
      CHECK (missing_case_id IS NOT NULL AND found_case_id IS NOT NULL) NOT VALID;
    ALTER TABLE public.match_candidates VALIDATE CONSTRAINT match_candidates_endpoints_not_null;
  END IF;
END $$;

DROP INDEX IF EXISTS public.match_candidates_one_confirmed_missing;
DROP INDEX IF EXISTS public.match_candidates_one_confirmed_found;
CREATE UNIQUE INDEX match_candidates_one_confirmed_missing
  ON public.match_candidates (missing_case_id) NULLS NOT DISTINCT WHERE status = 'confirmed';
CREATE UNIQUE INDEX match_candidates_one_confirmed_found
  ON public.match_candidates (found_case_id) NULLS NOT DISTINCT WHERE status = 'confirmed';
