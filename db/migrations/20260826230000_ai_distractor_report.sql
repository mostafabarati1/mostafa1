-- تحلیل هوشمند گزینه‌ها (distractor analysis) — additive only
-- انتشار آزمون هرگز به این گزارش وابسته نیست.

alter table public.questions
  add column if not exists ai_distractor_report jsonb,
  add column if not exists ai_distractor_reviewed boolean not null default false;

-- خواندن سوال و گزینه‌ها برای تحلیل
create or replace function public.ai_distractor_question_input(p_question_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  select jsonb_build_object(
           'question_id', q.id,
           'question_text', q.question_text,
           'difficulty', q.difficulty,
           'ai_distractor_report', q.ai_distractor_report,
           'ai_distractor_reviewed', q.ai_distractor_reviewed,
           'options', coalesce(
             (select jsonb_agg(jsonb_build_object(
                        'id', o.id, 'option_text', o.option_text, 'is_correct', o.is_correct)
                       order by o.display_order)
                from public.question_options o
               where o.question_id = q.id),
             '[]'::jsonb)
         )
    into v
    from public.questions q
   where q.id = p_question_id;

  if v is null then
    raise exception 'سوال یافت نشد';
  end if;
  return v;
end $$;

grant execute on function public.ai_distractor_question_input(uuid) to authenticated;

-- ذخیره گزارش تحلیل گزینه‌ها
create or replace function public.ai_distractor_save_report(p_question_id uuid, p_report jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  update public.questions
     set ai_distractor_report = coalesce(p_report, '[]'::jsonb),
         ai_distractor_reviewed = true
   where id = p_question_id;

  if not found then
    raise exception 'سوال یافت نشد';
  end if;
end $$;

grant execute on function public.ai_distractor_save_report(uuid, jsonb) to authenticated;

-- اعمال اصلاح یک گزینه (فقط متن همان گزینه)
create or replace function public.ai_distractor_apply_option(
  p_question_id uuid,
  p_option_id uuid,
  p_option_text text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  update public.question_options
     set option_text = p_option_text
   where id = p_option_id
     and question_id = p_question_id;

  if not found then
    raise exception 'گزینه یافت نشد';
  end if;
end $$;

grant execute on function public.ai_distractor_apply_option(uuid, uuid, text) to authenticated;
