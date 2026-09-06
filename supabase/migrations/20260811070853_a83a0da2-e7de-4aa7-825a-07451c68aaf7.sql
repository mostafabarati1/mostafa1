CREATE OR REPLACE FUNCTION public.assign_candidates(p_exam_id uuid, p_candidate_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.exam_assignments(exam_id, candidate_id)
  SELECT p_exam_id, c FROM unnest(COALESCE(p_candidate_ids,'{}'::uuid[])) AS c
  ON CONFLICT (exam_id, candidate_id) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.unassign_candidate(p_exam_id uuid, p_candidate_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.exam_assignments WHERE exam_id=p_exam_id AND candidate_id=p_candidate_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.assign_candidates(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unassign_candidate(uuid,uuid) TO authenticated;