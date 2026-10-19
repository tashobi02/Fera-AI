CREATE INDEX IF NOT EXISTS cases_district_anonymous_id_idx
  ON public.cases (district_code, id DESC) WHERE anonymised_at IS NULL;
CREATE INDEX IF NOT EXISTS cases_district_kind_anonymous_id_idx
  ON public.cases (district_code, kind, id DESC) WHERE anonymised_at IS NULL;
CREATE INDEX IF NOT EXISTS cases_district_kind_status_idx
  ON public.cases (district_code, kind, status);
