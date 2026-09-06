-- بازتعریف save_exam_v2 با اعتبارسنجی وضعیت و نوع دسترسی
-- تا مقادیر نامعتبر باعث خطای check constraint نشوند.
CREATE OR REPLACE FUNCTION public.save_exam_v2(
  p_id uuid, p_slug text, p_title text, p_description text, p_keywords text,
  p_meta_title text, p_meta_description text, p_access_type text, p_category_id uuid,
  p_organization_id uuid, p_level text, p_duration_minutes integer, p_max_attempts integer,
  p_passing_score numeric, p_randomize_questions boolean, p_randomize_options boolean,
  p_show_correct_answers boolean, p_is_free boolean, p_price numeric, p_status text,
  p_year integer, p_period text, p_round text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_status text;
  v_access text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_status := CASE
    WHEN nullif(btrim(coalesce(p_status, '')), '') IN ('draft','published','archived')
      THEN btrim(p_status) ELSE 'draft' END;
  v_access := CASE
    WHEN nullif(btrim(coalesce(p_access_type, '')), '') IN ('public','private','invitation_only')
      THEN btrim(p_access_type) ELSE 'public' END;

  IF p_id IS NULL THEN
    INSERT INTO public.exams(slug,title,description,keywords,meta_title,meta_description,access_type,
      category_id,organization_id,level,duration_minutes,max_attempts,passing_score,randomize_questions,
      randomize_options,show_correct_answers,is_free,price,status,year,period,round,created_by)
    VALUES (p_slug,p_title,p_description,p_keywords,p_meta_title,p_meta_description,v_access,
      p_category_id,p_organization_id,p_level,COALESCE(p_duration_minutes,60),COALESCE(p_max_attempts,1),
      COALESCE(p_passing_score,50),COALESCE(p_randomize_questions,false),COALESCE(p_randomize_options,false),
      COALESCE(p_show_correct_answers,false),COALESCE(p_is_free,true),COALESCE(p_price,0),
      v_status,p_year,p_period,p_round,auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.exams SET slug=p_slug,title=p_title,description=p_description,keywords=p_keywords,
      meta_title=p_meta_title,meta_description=p_meta_description,access_type=v_access,
      category_id=p_category_id,organization_id=p_organization_id,level=p_level,
      duration_minutes=COALESCE(p_duration_minutes,60),max_attempts=COALESCE(p_max_attempts,1),
      passing_score=COALESCE(p_passing_score,50),randomize_questions=COALESCE(p_randomize_questions,false),
      randomize_options=COALESCE(p_randomize_options,false),show_correct_answers=COALESCE(p_show_correct_answers,false),
      is_free=COALESCE(p_is_free,true),price=COALESCE(p_price,0),status=v_status,
      year=p_year,period=p_period,round=p_round
    WHERE id=p_id RETURNING id INTO v_id;
  END IF;

  PERFORM public.log_audit('exams', v_id, CASE WHEN p_id IS NULL THEN 'create' ELSE 'update' END, '{}'::jsonb);
  RETURN v_id;
END; $function$;
