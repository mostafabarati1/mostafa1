import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Newspaper, Pencil, PlusCircle, Send, Users } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, formatNumber, humanizeError } from "@/lib/format";
import {
  getNewsletterOverview,
  getSmsAudienceStats,
  listAdminNews,
  saveAdminNews,
  sendNewsToSubscribers,
  setAdminNewsStatus,
  type AdminNewsRow,
  type NewsStatus,
} from "@/lib/admin/newsletter.functions";
import { listNewsCategories } from "@/lib/newsletter/news-public.functions";

export const Route = createFileRoute("/admin/newsletter")({
  head: () => ({
    meta: [
      { title: "اخبار و خبرنامه | پنل مدیریت همراه استخدام" },
      {
        name: "description",
        content: "ثبت و انتشار اخبار استخدامی، مدیریت خبرنامه داخلی و ارسال پیامکی به مشترکان.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "اخبار و خبرنامه | پنل مدیریت" },
      { property: "og:description", content: "مدیریت اخبار استخدامی و ارسال خبرنامه پیامکی." },
    ],
  }),
  component: AdminNewsletterPage,
});

const STATUS_LABELS: Record<NewsStatus, string> = {
  draft: "پیش‌نویس",
  scheduled: "زمان‌بندی‌شده",
  published: "منتشرشده",
  archived: "بایگانی",
};

type FormState = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  status: NewsStatus;
  is_important: boolean;
  tags: string;
  category_id: string;
  cover_url: string;
  source_url: string;
  seo_title: string;
  seo_description: string;
  scheduled_at: string;
  sms: boolean;
  in_app: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  slug: "",
  summary: "",
  body: "",
  status: "draft",
  is_important: false,
  tags: "",
  category_id: "none",
  cover_url: "",
  source_url: "",
  seo_title: "",
  seo_description: "",
  scheduled_at: "",
  sms: true,
  in_app: true,
};

function toForm(row: AdminNewsRow): FormState {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug ?? "",
    summary: row.summary ?? "",
    body: row.body ?? "",
    status: row.status,
    is_important: row.is_important,
    tags: row.tags.join("، "),
    category_id: row.category_id ?? "none",
    cover_url: row.cover_url ?? "",
    source_url: row.source_url ?? "",
    seo_title: row.seo_title ?? "",
    seo_description: row.seo_description ?? "",
    scheduled_at: row.scheduled_at ? row.scheduled_at.slice(0, 16) : "",
    sms: true,
    in_app: true,
  };
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

function AdminNewsletterPage() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getNewsletterOverview);
  const fetchNews = useServerFn(listAdminNews);
  const fetchCategories = useServerFn(listNewsCategories);
  const fetchAudience = useServerFn(getSmsAudienceStats);
  const saveNews = useServerFn(saveAdminNews);
  const changeStatus = useServerFn(setAdminNewsStatus);
  const sendNews = useServerFn(sendNewsToSubscribers);

  const [statusFilter, setStatusFilter] = useState<"all" | NewsStatus>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [sendTarget, setSendTarget] = useState<AdminNewsRow | null>(null);

  const overviewQuery = useQuery({
    queryKey: ["admin", "newsletter", "overview"],
    queryFn: () => fetchOverview(),
  });

  const newsQuery = useQuery({
    queryKey: ["admin", "newsletter", "news", statusFilter, search],
    queryFn: () =>
      fetchNews({ data: { status: statusFilter, q: search || undefined, limit: 100 } }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["news", "categories"],
    queryFn: () => fetchCategories(),
    staleTime: 5 * 60_000,
  });

  const audienceQuery = useQuery({
    queryKey: ["admin", "newsletter", "audience"],
    queryFn: () => fetchAudience({ data: { categoryIds: [] } }),
    enabled: Boolean(sendTarget),
  });

  const save = useMutation({
    mutationFn: async (state: FormState) => {
      const tags = state.tags
        .split(/[،,]/)
        .map((t) => t.trim())
        .filter(Boolean);
      return saveNews({
        data: {
          ...(state.id ? { id: state.id } : {}),
          title: state.title,
          slug: state.slug || null,
          summary: state.summary || null,
          body: state.body || null,
          status: state.status,
          is_important: state.is_important,
          tags,
          category_id: state.category_id === "none" ? null : state.category_id,
          cover_url: state.cover_url || null,
          source_url: state.source_url || null,
          seo_title: state.seo_title || null,
          seo_description: state.seo_description || null,
          scheduled_at:
            state.status === "scheduled" && state.scheduled_at
              ? new Date(state.scheduled_at).toISOString()
              : null,
          channels: { site: true, in_app: state.in_app, sms: state.sms, email: false },
        },
      });
    },
    onSuccess: () => {
      toast.success("خبر ذخیره شد.");
      setForm(null);
      void qc.invalidateQueries({ queryKey: ["admin", "newsletter"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const publish = useMutation({
    mutationFn: (vars: { id: string; status: NewsStatus }) => changeStatus({ data: vars }),
    onSuccess: () => {
      toast.success("وضعیت خبر به‌روزرسانی شد.");
      void qc.invalidateQueries({ queryKey: ["admin", "newsletter"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const dispatch = useMutation({
    mutationFn: (vars: { newsId: string; channels: ("sms" | "in_app")[] }) =>
      sendNews({
        data: {
          newsId: vars.newsId,
          channels: vars.channels,
          audience: "all_newsletter",
          categoryIds: [],
          runNow: true,
        },
      }),
    onSuccess: (result) => {
      const queued = result.enqueued?.pending_jobs ?? 0;
      const sent = result.run?.sent ?? 0;
      toast.success(
        `در صف: ${formatNumber(queued)} — ارسال‌شده در این اجرا: ${formatNumber(sent)}`,
      );
      setSendTarget(null);
      void qc.invalidateQueries({ queryKey: ["admin", "newsletter"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const columns = useMemo<Column<AdminNewsRow>[]>(
    () => [
      {
        key: "title",
        header: "عنوان",
        cell: (row) => (
          <div className="min-w-52">
            <p className="font-medium text-foreground">{row.title}</p>
            <p className="text-xs text-muted-foreground">
              {row.category_name ?? "بدون دسته"} ·{" "}
              {formatDateTime(row.published_at ?? row.created_at)}
            </p>
          </div>
        ),
      },
      {
        key: "status",
        header: "وضعیت",
        cell: (row) => (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={row.status === "published" ? "default" : "secondary"}>
              {STATUS_LABELS[row.status]}
            </Badge>
            {row.is_important && <Badge variant="destructive">مهم</Badge>}
          </div>
        ),
      },
      {
        key: "sms",
        header: "پیامک",
        cell: (row) => (
          <span className="text-xs text-muted-foreground">
            ارسال‌شده {formatNumber(row.sms_sent)} · در صف {formatNumber(row.sms_pending)}
          </span>
        ),
      },
      {
        key: "actions",
        header: "عملیات",
        cell: (row) => (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setForm(toForm(row))}>
              <Pencil aria-hidden /> ویرایش
            </Button>
            {row.status !== "published" ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={publish.isPending}
                onClick={() => publish.mutate({ id: row.id, status: "published" })}
              >
                انتشار
              </Button>
            ) : (
              <Button size="sm" onClick={() => setSendTarget(row)}>
                <Send aria-hidden /> ارسال پیامکی
              </Button>
            )}
          </div>
        ),
      },
    ],
    [publish],
  );

  const overview = overviewQuery.data;

  return (
    <div>
      <PageHeader
        title="اخبار و خبرنامه"
        description="ثبت اخبار استخدامی، انتشار در سایت و ارسال به مشترکان خبرنامه از طریق پیامک."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin/newsletter-deliveries">
                <Users aria-hidden /> صف و گزارش ارسال
              </Link>
            </Button>
            <Button onClick={() => setForm({ ...EMPTY_FORM })}>
              <PlusCircle aria-hidden /> خبر جدید
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="اخبار منتشرشده"
          value={formatNumber(overview?.news.published ?? 0)}
          hint={`${formatNumber(overview?.news.draft ?? 0)} پیش‌نویس`}
        />
        <KpiCard
          label="مشترکان خبرنامه"
          value={formatNumber(overview?.audience.newsletter_on ?? 0)}
          hint={`از ${formatNumber(overview?.audience.active_accounts ?? 0)} حساب فعال`}
        />
        <KpiCard
          label="واجد دریافت پیامک"
          value={formatNumber(overview?.audience.sms_eligible ?? 0)}
          hint="موبایل تأییدشده + رضایت پیامک"
        />
        <KpiCard
          label="در صف ارسال"
          value={formatNumber(overview?.delivery.queued_jobs ?? 0)}
          hint={`${formatNumber(overview?.delivery.sms_sent ?? 0)} ارسال موفق`}
        />
      </div>

      <DataTable
        columns={columns}
        rows={newsQuery.data}
        isLoading={newsQuery.isPending}
        error={newsQuery.error}
        onRetry={() => void newsQuery.refetch()}
        rowKey={(row) => row.id}
        emptyTitle="هنوز خبری ثبت نشده است"
        emptyDescription="با دکمه «خبر جدید» اولین اطلاعیه استخدامی را منتشر کنید."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-full sm:w-64"
              placeholder="جستجوی عنوان یا خلاصه"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="جستجوی خبر"
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as "all" | NewsStatus)}
            >
              <SelectTrigger className="w-40" aria-label="فیلتر وضعیت">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="draft">پیش‌نویس</SelectItem>
                <SelectItem value="scheduled">زمان‌بندی‌شده</SelectItem>
                <SelectItem value="published">منتشرشده</SelectItem>
                <SelectItem value="archived">بایگانی</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* فرم ثبت/ویرایش خبر */}
      <Dialog open={Boolean(form)} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "ویرایش خبر" : "خبر جدید"}</DialogTitle>
            <DialogDescription>
              اطلاعات خبر استخدامی را وارد کنید. پس از انتشار می‌توانید آن را برای مشترکان پیامک
              کنید.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                save.mutate(form);
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="news-title">عنوان</Label>
                <Input
                  id="news-title"
                  required
                  minLength={3}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="news-slug">نشانی یکتا (اختیاری)</Label>
                  <Input
                    id="news-slug"
                    dir="ltr"
                    className="text-left"
                    value={form.slug}
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="news-category">دسته‌بندی</Label>
                  <Select
                    value={form.category_id}
                    onValueChange={(v) => setForm({ ...form, category_id: v })}
                  >
                    <SelectTrigger id="news-category">
                      <SelectValue placeholder="انتخاب دسته" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون دسته</SelectItem>
                      {(categoriesQuery.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="news-summary">خلاصه</Label>
                <Textarea
                  id="news-summary"
                  rows={2}
                  maxLength={600}
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="news-body">متن کامل</Label>
                <Textarea
                  id="news-body"
                  rows={8}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="news-status">وضعیت</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as NewsStatus })}
                  >
                    <SelectTrigger id="news-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">پیش‌نویس</SelectItem>
                      <SelectItem value="scheduled">زمان‌بندی‌شده</SelectItem>
                      <SelectItem value="published">منتشرشده</SelectItem>
                      <SelectItem value="archived">بایگانی</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.status === "scheduled" && (
                  <div className="grid gap-2">
                    <Label htmlFor="news-scheduled">زمان انتشار</Label>
                    <Input
                      id="news-scheduled"
                      type="datetime-local"
                      value={form.scheduled_at}
                      onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="news-tags">برچسب‌ها (با ویرگول)</Label>
                  <Input
                    id="news-tags"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="news-cover">تصویر شاخص (URL)</Label>
                  <Input
                    id="news-cover"
                    dir="ltr"
                    className="text-left"
                    value={form.cover_url}
                    onChange={(e) => setForm({ ...form, cover_url: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="news-seo-title">عنوان سئو</Label>
                  <Input
                    id="news-seo-title"
                    maxLength={160}
                    value={form.seo_title}
                    onChange={(e) => setForm({ ...form, seo_title: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="news-source">لینک منبع</Label>
                  <Input
                    id="news-source"
                    dir="ltr"
                    className="text-left"
                    value={form.source_url}
                    onChange={(e) => setForm({ ...form, source_url: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="news-seo-desc">توضیحات سئو</Label>
                <Textarea
                  id="news-seo-desc"
                  rows={2}
                  maxLength={300}
                  value={form.seo_description}
                  onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
                />
              </div>

              <div className="flex flex-wrap gap-6 rounded-xl border border-border p-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="news-important"
                    checked={form.is_important}
                    onCheckedChange={(v) => setForm({ ...form, is_important: v })}
                  />
                  <Label htmlFor="news-important">خبر مهم</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="news-sms"
                    checked={form.sms}
                    onCheckedChange={(v) => setForm({ ...form, sms: v })}
                  />
                  <Label htmlFor="news-sms">مجاز برای ارسال پیامکی</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="news-inapp"
                    checked={form.in_app}
                    onCheckedChange={(v) => setForm({ ...form, in_app: v })}
                  />
                  <Label htmlFor="news-inapp">اعلان داخل سامانه</Label>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>
                  انصراف
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
                  ذخیره
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ارسال به مشترکان */}
      <Dialog open={Boolean(sendTarget)} onOpenChange={(open) => !open && setSendTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ارسال خبر به مشترکان</DialogTitle>
            <DialogDescription>
              پیامک فقط برای کاربرانی ارسال می‌شود که خبرنامه و کانال پیامک را فعال کرده و شماره
              موبایل تأییدشده دارند. ارسال تکراری برای هر کاربر به‌صورت خودکار جلوگیری می‌شود.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <p className="font-medium text-foreground">{sendTarget?.title}</p>
            {audienceQuery.isPending ? (
              <p className="mt-2 flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> محاسبه مخاطبان…
              </p>
            ) : audienceQuery.data ? (
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                <li>واجد شرایط پیامک: {formatNumber(audienceQuery.data.eligible)}</li>
                <li>بدون شماره موبایل: {formatNumber(audienceQuery.data.no_mobile)}</li>
                <li>شماره تأییدنشده: {formatNumber(audienceQuery.data.unverified_mobile)}</li>
                <li>پیامک غیرفعال: {formatNumber(audienceQuery.data.sms_off)}</li>
              </ul>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSendTarget(null)}>
              انصراف
            </Button>
            <Button
              disabled={dispatch.isPending || !sendTarget}
              onClick={() =>
                sendTarget &&
                dispatch.mutate({ newsId: sendTarget.id, channels: ["sms", "in_app"] })
              }
            >
              {dispatch.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Newspaper aria-hidden />
              )}
              ثبت در صف و ارسال
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
