-- تشخیص تکرار معنایی سوالات با embedding — فقط افزایشی (additive)
-- منطق فعلی fingerprint/RPCهای ورود گروهی دست‌نخورده می‌ماند؛ این فقط یک قابلیت مکمل اختیاری است.
-- اگر افزونه vector یا این جدول در دسترس نباشد، لایه سرور اپلیکیشن با graceful degradation ادامه می‌دهد.

create extension if not exists vector;

create table if not exists public.question_embeddings (
  question_id uuid primary key references public.questions(id) on delete cascade,
  embedding vector(1536),
  model text,
  updated_at timestamptz not null default now()
);

alter table public.question_embeddings enable row level security;

create index if not exists idx_question_embeddings_hnsw
  on public.question_embeddings using hnsw (embedding vector_cosine_ops);

-- دسترسی مستقیم Data API بسته است؛ فقط service_role و توابع امن زیر.
grant all on public.question_embeddings to service_role;

-- ---------------------------------------------------------------------------
-- درج/به‌روزرسانی embedding یک سوال
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_question_embedding(
  p_question_id uuid,
  p_embedding jsonb,
  p_model text default null
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

  insert into public.question_embeddings (question_id, embedding, model, updated_at)
  values (p_question_id, (p_embedding::text)::vector(1536), p_model, now())
  on conflict (question_id) do update
    set embedding = excluded.embedding,
        model = excluded.model,
        updated_at = now();
end $$;

grant execute on function public.admin_upsert_question_embedding(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- جست‌وجوی نزدیک‌ترین سوالات فعال برای مجموعه‌ای از بردارهای ورودی (هر سطر فایل)
-- ---------------------------------------------------------------------------
create or replace function public.admin_search_similar_questions_batch(
  p_rows jsonb,
  p_threshold double precision default 0.92,
  p_limit_per_row integer default 3
)
returns table (
  row_number integer,
  question_id uuid,
  question_text text,
  similarity double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  return query
  select r.row_number, m.question_id, m.question_text, m.similarity
    from jsonb_to_recordset(p_rows) as r(row_number integer, embedding jsonb)
    cross join lateral (
      select qe.question_id,
             q.question_text,
             1 - (qe.embedding <=> (r.embedding::text)::vector(1536)) as similarity
        from public.question_embeddings qe
        join public.questions q on q.id = qe.question_id
       where q.status = 'active'
       order by qe.embedding <=> (r.embedding::text)::vector(1536)
       limit p_limit_per_row
    ) m
   where m.similarity >= p_threshold;
end $$;

grant execute on function public.admin_search_similar_questions_batch(jsonb, double precision, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- تنظیمات مدل/آستانه تشخیص تکرار معنایی، در صورت وجود جدول تنظیمات؛ در غیر این صورت پیش‌فرض
-- ---------------------------------------------------------------------------
create or replace function public.admin_ai_dedup_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_model text := 'text-embedding-3-small';
  v_threshold double precision := 0.92;
  v_value text;
begin
  if not public.is_admin() then
    raise exception 'دسترسی مدیر لازم است';
  end if;

  begin
    if to_regclass('public.ai_settings') is not null then
      execute 'select value from public.ai_settings where key = ''embedding_model'' limit 1'
        into v_value;
      if v_value is not null and v_value <> '' then v_model := v_value; end if;

      execute 'select value from public.ai_settings where key = ''dedup_similarity_threshold'' limit 1'
        into v_value;
      if v_value is not null and v_value ~ '^[0-9.]+$' then v_threshold := v_value::double precision; end if;
    elsif to_regclass('public.app_settings') is not null then
      execute 'select value from public.app_settings where key = ''embedding_model'' limit 1'
        into v_value;
      if v_value is not null and v_value <> '' then v_model := v_value; end if;

      execute 'select value from public.app_settings where key = ''dedup_similarity_threshold'' limit 1'
        into v_value;
      if v_value is not null and v_value ~ '^[0-9.]+$' then v_threshold := v_value::double precision; end if;
    end if;
  exception when others then
    v_model := 'text-embedding-3-small';
    v_threshold := 0.92;
  end;

  return jsonb_build_object('model', v_model, 'threshold', v_threshold);
end $$;

grant execute on function public.admin_ai_dedup_settings() to authenticated;
