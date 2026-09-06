-- تولید انبوه پاسخ تشریحی — فقط افزایشی (additive)
-- هیچ جدول/ستون موجودی تغییر نمی‌کند. دسترسی فقط از طریق توابع security definer.

create table if not exists public.ai_explanation_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued', -- queued|running|paused|done|failed|canceled
  total_questions int not null default 0,
  processed int not null default 0,
  succeeded int not null default 0,
  failed int not null default 0,
  filters jsonb not null default '{}'::jsonb,
  error_summary jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_explanation_jobs enable row level security;

create index if not exists idx_ai_jobs_status on public.ai_explanation_jobs (status);
create index if not exists idx_ai_jobs_created_at on public.ai_explanation_jobs (created_at desc);

-- دسترسی مستقیم Data API بسته است؛ فقط service_role و توابع امن زیر.
grant all on public.ai_explanation_jobs to service_role;

-- ---------------------------------------------------------------------------
-- سوال‌های بدون پاسخ تشریحی (فقط سوال‌های منتشر/فعال)
-- ---------------------------------------------------------------------------
create or replace function public.ai_explanation_pending_questions(
  p_category_id uuid default null,
  p_subject_id uuid default null,
  p_limit int default 500
)
returns table (question_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select q.id
  from public.questions q
  where public.is_admin()
    and q.status = 'active'
    and (p_category_id is null or q.category_id = p_category_id)
    and (p_subject_id is null or q.subject_id = p_subject_id)
    and not exists (select 1 from public.ai_explanations e where e.question_id = q.id)
  order by q.created_at asc
  limit greatest(1, least(coalesce(p_limit, 500), 5000));
$$;

create or replace function public.ai_explanation_pending_count(
  p_category_id uuid default null,
  p_subject_id uuid default null
)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then (
    select count(*)::int
    from public.questions q
    where q.status = 'active'
      and (p_category_id is null or q.category_id = p_category_id)
      and (p_subject_id is null or q.subject_id = p_subject_id)
      and not exists (select 1 from public.ai_explanations e where e.question_id = q.id)
  ) else 0 end;
$$;

-- ---------------------------------------------------------------------------
-- ساخت جاب
-- ---------------------------------------------------------------------------
create or replace function public.ai_explanation_job_create(
  p_total int,
  p_filters jsonb default '{}'::jsonb
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
    raise exception 'Forbidden';
  end if;

  insert into public.ai_explanation_jobs (status, total_questions, filters, created_by)
  values ('running', greatest(coalesce(p_total, 0), 0), coalesce(p_filters, '{}'::jsonb), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- تغییر وضعیت (pause/resume/done/failed/canceled)
-- ---------------------------------------------------------------------------
create or replace function public.ai_explanation_job_set_status(
  p_job_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;
  if p_status not in ('queued', 'running', 'paused', 'done', 'failed', 'canceled') then
    raise exception 'Invalid status';
  end if;

  update public.ai_explanation_jobs
     set status = p_status,
         updated_at = now()
   where id = p_job_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- ثبت پیشرفت یک سوال (idempotent نیست؛ هر فراخوانی یک قدم است)
-- ---------------------------------------------------------------------------
create or replace function public.ai_explanation_job_progress(
  p_job_id uuid,
  p_question_id uuid,
  p_ok boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden';
  end if;

  update public.ai_explanation_jobs
     set processed = processed + 1,
         succeeded = succeeded + case when p_ok then 1 else 0 end,
         failed = failed + case when p_ok then 0 else 1 end,
         error_summary = case
           when p_ok then error_summary
           else (
             case when jsonb_array_length(error_summary) >= 200
               then error_summary
               else error_summary || jsonb_build_array(jsonb_build_object(
                 'question_id', p_question_id,
                 'error', left(coalesce(p_error, 'خطای نامشخص'), 300),
                 'at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
               ))
             end
           )
         end,
         updated_at = now()
   where id = p_job_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- خواندن جاب‌ها
-- ---------------------------------------------------------------------------
create or replace function public.ai_explanation_jobs_list(p_limit int default 10)
returns setof public.ai_explanation_jobs
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.ai_explanation_jobs
  where public.is_admin()
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

create or replace function public.ai_explanation_job_get(p_job_id uuid)
returns public.ai_explanation_jobs
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.ai_explanation_jobs
  where public.is_admin() and id = p_job_id;
$$;

grant execute on function public.ai_explanation_pending_questions(uuid, uuid, int) to authenticated;
grant execute on function public.ai_explanation_pending_count(uuid, uuid) to authenticated;
grant execute on function public.ai_explanation_job_create(int, jsonb) to authenticated;
grant execute on function public.ai_explanation_job_set_status(uuid, text) to authenticated;
grant execute on function public.ai_explanation_job_progress(uuid, uuid, boolean, text) to authenticated;
grant execute on function public.ai_explanation_jobs_list(int) to authenticated;
grant execute on function public.ai_explanation_job_get(uuid) to authenticated;
