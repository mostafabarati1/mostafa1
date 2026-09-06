-- تولید سوال با هوش مصنوعی — additive only
-- پیش‌نویس‌های تولیدشده تا تأیید صریح مدیر وارد بانک سوال نمی‌شوند.

create table if not exists public.ai_question_drafts (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',
  question_text text not null,
  difficulty text,
  category_id uuid references public.categories(id),
  subject_id uuid references public.subjects(id),
  options jsonb not null default '[]'::jsonb,
  explanation text,
  source_model text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_question_drafts_status_created_idx
  on public.ai_question_drafts (status, created_at desc);

alter table public.ai_question_drafts enable row level security;

drop policy if exists "ai_question_drafts_admin_all" on public.ai_question_drafts;
create policy "ai_question_drafts_admin_all"
  on public.ai_question_drafts
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- درج پیش‌نویس جدید
create or replace function public.ai_question_draft_insert(
  p_question_text text,
  p_difficulty text,
  p_category_id uuid,
  p_subject_id uuid,
  p_options jsonb,
  p_explanation text,
  p_source_model text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  insert into public.ai_question_drafts(
    status, question_text, difficulty, category_id, subject_id,
    options, explanation, source_model, created_by
  )
  values (
    'draft', p_question_text, p_difficulty, p_category_id, p_subject_id,
    coalesce(p_options, '[]'::jsonb), p_explanation, p_source_model, auth.uid()
  )
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.ai_question_draft_insert(text, text, uuid, uuid, jsonb, text, text) to authenticated;

-- فهرست پیش‌نویس‌ها
create or replace function public.ai_question_draft_list(p_status text default null)
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

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id,
           'status', d.status,
           'question_text', d.question_text,
           'difficulty', d.difficulty,
           'category_id', d.category_id,
           'subject_id', d.subject_id,
           'options', d.options,
           'explanation', d.explanation,
           'source_model', d.source_model,
           'created_at', d.created_at,
           'updated_at', d.updated_at
         ) order by d.created_at desc), '[]'::jsonb)
    into v
    from public.ai_question_drafts d
   where p_status is null or d.status = p_status;

  return v;
end $$;

grant execute on function public.ai_question_draft_list(text) to authenticated;

-- ویرایش پیش‌نویس پیش از تأیید
create or replace function public.ai_question_draft_update(
  p_id uuid,
  p_question_text text,
  p_difficulty text,
  p_category_id uuid,
  p_subject_id uuid,
  p_options jsonb,
  p_explanation text
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

  update public.ai_question_drafts
     set question_text = coalesce(p_question_text, question_text),
         difficulty = coalesce(p_difficulty, difficulty),
         category_id = p_category_id,
         subject_id = p_subject_id,
         options = coalesce(p_options, options),
         explanation = coalesce(p_explanation, explanation),
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'پیش‌نویس یافت نشد';
  end if;
end $$;

grant execute on function public.ai_question_draft_update(uuid, text, text, uuid, uuid, jsonb, text) to authenticated;

-- تغییر وضعیت پیش‌نویس (approved/rejected)
create or replace function public.ai_question_draft_set_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  if p_status not in ('draft', 'approved', 'rejected') then
    raise exception 'وضعیت نامعتبر است';
  end if;

  update public.ai_question_drafts
     set status = p_status,
         updated_at = now()
   where id = p_id;

  if not found then
    raise exception 'پیش‌نویس یافت نشد';
  end if;
end $$;

grant execute on function public.ai_question_draft_set_status(uuid, text) to authenticated;

-- نمونه‌های واقعی فعال یک دسته برای few-shot prompting
create or replace function public.ai_question_fewshot_examples(p_category_id uuid, p_limit int default 3)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
  v_limit int := least(greatest(coalesce(p_limit, 3), 1), 10);
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb)
    into v
    from (
      select jsonb_build_object(
               'question_text', q.question_text,
               'difficulty', q.difficulty,
               'options', coalesce(
                 (select jsonb_agg(jsonb_build_object('text', o.option_text, 'is_correct', o.is_correct)
                                   order by o.display_order)
                    from public.question_options o
                   where o.question_id = q.id),
                 '[]'::jsonb)
             ) as item
        from public.questions q
       where q.status = 'active'
         and (p_category_id is null or q.category_id = p_category_id)
       order by q.created_at desc
       limit v_limit
    ) s;

  return v;
end $$;

grant execute on function public.ai_question_fewshot_examples(uuid, int) to authenticated;
