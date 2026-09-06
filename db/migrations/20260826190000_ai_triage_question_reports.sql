-- تحلیل هوشمند گزارش‌های سوال (triage) — فقط افزایشی (additive)
-- منطق فعلی status/admin_note دست‌نخورده می‌ماند؛ فقط یک ستون تحلیل اضافه می‌شود.

alter table public.question_reports
  add column if not exists ai_triage jsonb;

create or replace function public.question_report_save_triage(
  p_report_id uuid,
  p_triage jsonb
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

  update public.question_reports
     set ai_triage = coalesce(p_triage, '{}'::jsonb),
         updated_at = now()
   where id = p_report_id;

  if not found then
    raise exception 'گزارش یافت نشد';
  end if;
end $$;

grant execute on function public.question_report_save_triage(uuid, jsonb) to authenticated;

-- خواندن گزارش همراه سوال و گزینه‌ها برای تحلیل
create or replace function public.question_report_triage_input(p_report_id uuid)
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
           'report_id', r.id,
           'reason', r.reason,
           'description', r.description,
           'status', r.status,
           'admin_note', r.admin_note,
           'question_text', q.question_text,
           'difficulty', q.difficulty,
           'options', coalesce(
             (select jsonb_agg(jsonb_build_object('text', o.option_text, 'is_correct', o.is_correct)
                               order by o.option_text)
                from public.question_options o
               where o.question_id = q.id),
             '[]'::jsonb)
         )
    into v
    from public.question_reports r
    join public.questions q on q.id = r.question_id
   where r.id = p_report_id;

  if v is null then
    raise exception 'گزارش یافت نشد';
  end if;
  return v;
end $$;

grant execute on function public.question_report_triage_input(uuid) to authenticated;
