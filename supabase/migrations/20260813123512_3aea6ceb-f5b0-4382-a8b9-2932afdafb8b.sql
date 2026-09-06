DO $do$
DECLARE
  f oid;
  src text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.build_candidate_analytics(uuid, date, date, uuid)'::regprocedure::oid,
    'public.weak_topics_for_user(uuid, integer)'::regprocedure::oid
  ] LOOP
    src := pg_get_functiondef(f);
    src := replace(src, 'max(subject_id)', '(array_agg(subject_id))[1]');
    src := replace(src, 'max(q.subject_id)', '(array_agg(q.subject_id))[1]');
    EXECUTE src;
  END LOOP;
END
$do$;

REVOKE ALL ON FUNCTION public.build_candidate_analytics(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.build_candidate_analytics(uuid, date, date, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.weak_topics_for_user(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.weak_topics_for_user(uuid, integer) TO authenticated, service_role;