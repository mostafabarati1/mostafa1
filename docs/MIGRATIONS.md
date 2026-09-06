# حاکمیت Migration ها (Migration Governance)

## منبع حقیقت

**`supabase/migrations/` تنها منبع حقیقت (source of truth) اسکیمای دیتابیس است.**

- تعداد فایل‌ها در زمان نگارش: `supabase/migrations` = ۹۶ فایل، `db/migrations` = ۶ فایل.
- پوشه `db/migrations/` یک مسیر تاریخی است که ۶ Migration افزایشی (additive) در آن باقی
  مانده و **حذف یا squash نشده است**، چون ممکن است روی محیط production اجرا شده باشد.

## ۶ فایل موجود در `db/migrations/`

| فایل                                                 | ماهیت         |
| ---------------------------------------------------- | ------------- |
| `20260824140000_newsletter_account_sms.sql`          | additive      |
| `20260825093000_newsletter_subscribers_additive.sql` | additive      |
| `20260825120000_news_editorial_columns_additive.sql` | additive      |
| `20260825140000_is_admin_grant_execute.sql`          | grant         |
| `20260825151000_digest_frequency_text_cast.sql`      | تغییر نوع/کست |
| `20260825160000_newsletter_set_my_email.sql`         | function      |

## قواعد

1. هر Migration جدید فقط در `supabase/migrations/` با نام `YYYYMMDDHHMMSS_<slug>.sql` ساخته شود.
2. Migration ها باید **additive و idempotent** باشند: `IF NOT EXISTS`,
   `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`.
3. هیچ `DROP TABLE`, `DROP COLUMN`, `DELETE`, `TRUNCATE` یا `RESET` روی داده production مجاز نیست.
4. هر `CREATE TABLE` در schema `public` باید بلافاصله `GRANT` های لازم، سپس
   `ENABLE ROW LEVEL SECURITY` و سپس `CREATE POLICY` داشته باشد.
5. هر `SECURITY DEFINER` باید `SET search_path = public` و `REVOKE/GRANT EXECUTE` صریح داشته باشد.

## انتقال `db/migrations` → `supabase/migrations`

فایل‌های موجود **کپی یا جابه‌جا نشده‌اند**، چون ترتیب اجرا و وضعیت اجرای آن‌ها روی
production بدون دسترسی به دیتابیس واقعی قابل تأیید نیست. برای انتقال امن:

1. روی staging خروجی `supabase migration list` را بگیرید و مشخص کنید کدام‌یک از این ۶
   Migration قبلاً اعمال شده است.
2. برای موارد اعمال‌نشده، یک Migration «یک‌باره و idempotent» در `supabase/migrations/`
   بسازید که همان تغییرات را با `IF NOT EXISTS` تکرار کند.
3. پس از تأیید همسانی اسکیما، `db/migrations/` را فقط **آرشیو** کنید (README در همان
   پوشه)، نه حذف.

> وضعیت: `needs external configuration` — انجام گام‌های بالا نیازمند دسترسی به
> دیتابیس staging/production است.

## تشخیص Schema Drift

```bash
supabase db diff --linked --schema public   # اختلاف اسکیمای local با پروژه متصل
supabase migration list --linked            # فهرست اعمال‌شده/نشده
```

این دو دستور باید قبل از هر انتشار روی staging اجرا و خروجی آن‌ها بایگانی شود.
