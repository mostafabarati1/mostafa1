-- پیشنهاد سطح دشواری با هوش مصنوعی — فقط افزایشی (additive)
-- ستون‌های جدید روی public.questions و دو تابع security definer.
-- ستون `difficulty` هرگز به‌صورت خودکار تغییر نمی‌کند؛ فقط با تأیید صریح مدیر.

alter table public.questions
  add column if not exists ai_suggested_difficulty text,
  add column if not exists ai_difficulty_confidence numeric,
  add column if not exists ai_difficulty_reason text,
  add column if not exists ai_difficulty_at timestamptz,
  add column if not exists difficulty_reviewed boolean not null default false;

create index if not exists idx_questions_ai_difficulty
  on public.questions (ai_suggested_difficulty)
  where ai_suggested_difficulty is not null;

-- ذخیره پیشنهاد (بدون تغییر difficulty فعلی)
create or replace function public.ai_difficulty_save_suggestion(
  p_question_id uuid,
  p_difficulty text,
  p_confidence numeric default null,
  p_reason text default null
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
  if p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'سطح دشواری نامعتبر است';
  end if;

  update public.questions
     set ai_suggested_difficulty = p_difficulty,
         ai_difficulty_confidence = greatest(0, least(1, coalesce(p_confidence, 0))),
         ai_difficulty_reason = left(coalesce(p_reason, ''), 1000),
         ai_difficulty_at = now(),
         difficulty_reviewed = false,
         updated_at = now()
   where id = p_question_id;

  if not found then
    raise exception 'سوال یافت نشد';
  end if;
end $$;

-- اعمال دستی پیشنهاد روی سطح دشواری واقعی
create or replace function public.ai_difficulty_apply(
  p_question_id uuid,
  p_difficulty text
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
  if p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'سطح دشواری نامعتبر است';
  end if;

  update public.questions
     set difficulty = p_difficulty,
         difficulty_reviewed = true,
         updated_at = now()
   where id = p_question_id;

  if not found then
    raise exception 'سوال یافت نشد';
  end if;
end $$;

grant execute on function public.ai_difficulty_save_suggestion(uuid, text, numeric, text) to authenticated;
grant execute on function public.ai_difficulty_apply(uuid, text) to authenticated;
