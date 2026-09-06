GRANT EXECUTE ON FUNCTION public.list_exams_public(text, uuid, uuid, integer, uuid, text, boolean, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.exam_catalog_tree() TO anon;
GRANT EXECUTE ON FUNCTION public.get_exam_public(text) TO anon;
GRANT EXECUTE ON FUNCTION public.can_view_exam(uuid) TO anon;