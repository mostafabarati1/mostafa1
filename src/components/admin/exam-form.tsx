import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Archive, Loader2, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, LoadingState } from "@/components/data-states";
import { formatDateTime, formatNumber, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { supabase } from "@/integrations/supabase/client";
import { adminExamDetailQuery, type AdminExamDetail } from "@/lib/admin/queries";
import { ExamSubjectsEditor } from "@/components/admin/exam-subjects-editor";
import { useSetExamStatus } from "@/lib/admin/exam-mutations";

export type ExamFormValues = {
  title: string;
  slug: string;
  description: string;
  status: "draft" | "published" | "archived";
  access_type: "public" | "private" | "invitation_only";
  category_id: string | null;
  organization_id: string | null;
  level: string;
  duration_minutes: number;
  max_attempts: number;
  passing_score: number;
  is_free: boolean;
  price: number;
  randomize_questions: boolean;
  randomize_options: boolean;
  show_correct_answers: boolean;
  year: string;
  period: string;
  round: string;
  keywords: string;
  meta_title: string;
  meta_description: string;
};

const EMPTY: ExamFormValues = {
  title: "",
  slug: "",
  description: "",
  status: "draft",
  access_type: "public",
  category_id: null,
  organization_id: null,
  level: "",
  duration_minutes: 60,
  max_attempts: 1,
  passing_score: 50,
  is_free: true,
  price: 0,
  randomize_questions: false,
  randomize_options: false,
  show_correct_answers: false,
  year: "",
  period: "",
  round: "",
  keywords: "",
  meta_title: "",
  meta_description: "",
};

const STATUS_VALUES = ["draft", "published", "archived"] as const;
const ACCESS_VALUES = ["public", "private", "invitation_only"] as const;

function normalizeStatus(v: unknown): ExamFormValues["status"] {
  return (STATUS_VALUES as readonly string[]).includes(String(v))
    ? (v as ExamFormValues["status"])
    : "draft";
}

function normalizeAccess(v: unknown): ExamFormValues["access_type"] {
  return (ACCESS_VALUES as readonly string[]).includes(String(v))
    ? (v as ExamFormValues["access_type"])
    : "public";
}

function slugify(v: string) {
  return v
    .trim()
    .replace(/[\s_/\\]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function useTaxonomies() {
  return useQuery({
    queryKey: ["admin", "exam-taxonomies"],
    queryFn: async () => {
      const [cats, orgs] = await Promise.all([
        supabase.from("categories").select("id, name").order("display_order"),
        supabase.from("organizations").select("id, name").order("display_order"),
      ]);
      if (cats.error) throw cats.error;
      if (orgs.error) throw orgs.error;
      return { categories: cats.data ?? [], organizations: orgs.data ?? [] };
    },
    staleTime: 300_000,
  });
}

export function ExamForm({ examId }: { examId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const taxonomies = useTaxonomies();
  const setStatus = useSetExamStatus();
  const [values, setValues] = useState<ExamFormValues>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(Boolean(examId));

  const detail = useQuery({ ...adminExamDetailQuery(examId ?? ""), enabled: Boolean(examId) });

  useEffect(() => {
    const d = detail.data as AdminExamDetail | undefined;
    if (!d) return;
    setValues({
      title: d.title ?? "",
      slug: d.slug ?? "",
      description: d.description ?? "",
      status: normalizeStatus(d.status),
      access_type: normalizeAccess(d.access_type),
      category_id: d.category_id ?? null,
      organization_id: d.organization_id ?? null,
      level: d.level ?? "",
      duration_minutes: d.duration_minutes ?? 60,
      max_attempts: d.max_attempts ?? 1,
      passing_score: Number(d.passing_score ?? 50),
      is_free: d.is_free ?? true,
      price: Number(d.price ?? 0),
      randomize_questions: d.randomize_questions ?? false,
      randomize_options: d.randomize_options ?? false,
      show_correct_answers: d.show_correct_answers ?? false,
      year: d.year != null ? String(d.year) : "",
      period: d.period ?? "",
      round: d.round ?? "",
      keywords: d.keywords ?? "",
      meta_title: d.meta_title ?? "",
      meta_description: d.meta_description ?? "",
    });
  }, [detail.data]);

  const set = <K extends keyof ExamFormValues>(key: K, value: ExamFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: async () => {
      const slug = values.slug.trim() || slugify(values.title);
      if (!values.title.trim()) throw new Error("عنوان آزمون الزامی است.");
      if (!slug) throw new Error("نشانی (slug) آزمون الزامی است.");
      return rpc<string>("save_exam_v2", {
        p_id: examId ?? null,
        p_slug: slug,
        p_title: values.title.trim(),
        p_description: values.description.trim() || null,
        p_keywords: values.keywords.trim() || null,
        p_meta_title: values.meta_title.trim() || null,
        p_meta_description: values.meta_description.trim() || null,
        p_access_type: normalizeAccess(values.access_type),
        p_category_id: values.category_id,
        p_organization_id: values.organization_id,
        p_level: values.level.trim() || null,
        p_duration_minutes: values.duration_minutes,
        p_max_attempts: values.max_attempts,
        p_passing_score: values.passing_score,
        p_randomize_questions: values.randomize_questions,
        p_randomize_options: values.randomize_options,
        p_show_correct_answers: values.show_correct_answers,
        p_is_free: values.is_free,
        p_price: values.is_free ? 0 : values.price,
        p_status: normalizeStatus(values.status),
        p_year: values.year.trim() ? Number(values.year) : null,
        p_period: values.period.trim() || null,
        p_round: values.round.trim() || null,
      });
    },
    onSuccess: (id) => {
      toast.success(examId ? "تغییرات آزمون ذخیره شد." : "آزمون جدید ساخته شد.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "exams"] });
      if (examId) {
        void queryClient.invalidateQueries({ queryKey: ["admin", "exam", examId] });
      } else {
        void navigate({ to: "/admin/exams/$id", params: { id } });
      }
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  if (examId && detail.isLoading) return <LoadingState rows={8} />;
  if (examId && detail.error)
    return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;

  const d = detail.data as AdminExamDetail | undefined;

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      {examId && d && (
        <Card>
          <CardHeader>
            <CardTitle>وضعیت فعلی در پایگاه داده</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">دسته‌بندی ثبت‌شده</p>
              <p className="font-medium">{d.category_name ?? "ثبت نشده"}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">سازمان ثبت‌شده</p>
              <p className="font-medium">{d.organization_name ?? "ثبت نشده"}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">تعداد سوال‌های آزمون</p>
              <p className="font-medium">{formatNumber(d.question_count ?? 0)}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">تعداد درس‌ها</p>
              <p className="font-medium">{formatNumber(d.subjects?.length ?? 0)}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">تعداد شرکت در آزمون</p>
              <p className="font-medium">{formatNumber(d.attempt_count ?? 0)}</p>
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground">آخرین به‌روزرسانی</p>
              <p className="font-medium">{formatDateTime(d.updated_at)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>اطلاعات اصلی</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">عنوان آزمون</Label>
            <Input
              id="title"
              value={values.title}
              onChange={(e) => {
                set("title", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
              placeholder="مثلاً آزمون استخدامی آموزش و پرورش"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">نشانی یکتا (slug)</Label>
            <Input
              id="slug"
              value={values.slug}
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
              dir="ltr"
              placeholder="exam-slug"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="level">سطح</Label>
            <Input
              id="level"
              value={values.level}
              onChange={(e) => set("level", e.target.value)}
              placeholder="مقدماتی / متوسط / پیشرفته"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description">توضیح آزمون</Label>
            <Textarea
              id="description"
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              rows={5}
              placeholder="توضیح کوتاه درباره‌ی محتوا و شرایط آزمون"
            />
          </div>
          <div className="space-y-2">
            <Label>دسته‌بندی</Label>
            <Select
              value={values.category_id ?? "none"}
              onValueChange={(v) => set("category_id", v === "none" ? null : v)}
            >
              <SelectTrigger aria-label="دسته‌بندی">
                <SelectValue placeholder="انتخاب دسته" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون دسته</SelectItem>
                {(taxonomies.data?.categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>سازمان</Label>
            <Select
              value={values.organization_id ?? "none"}
              onValueChange={(v) => set("organization_id", v === "none" ? null : v)}
            >
              <SelectTrigger aria-label="سازمان">
                <SelectValue placeholder="انتخاب سازمان" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون سازمان</SelectItem>
                {(taxonomies.data?.organizations ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>انتشار و دسترسی</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>وضعیت انتشار</Label>
            <Select
              value={values.status}
              onValueChange={(v) => set("status", v as ExamFormValues["status"])}
            >
              <SelectTrigger aria-label="وضعیت انتشار">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">پیش‌نویس</SelectItem>
                <SelectItem value="published">منتشرشده</SelectItem>
                <SelectItem value="archived">بایگانی</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>نوع دسترسی</Label>
            <Select
              value={values.access_type}
              onValueChange={(v) => set("access_type", v as ExamFormValues["access_type"])}
            >
              <SelectTrigger aria-label="نوع دسترسی">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">عمومی</SelectItem>
                <SelectItem value="private">خصوصی</SelectItem>
                <SelectItem value="invitation_only">فقط با دعوت</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3 md:col-span-2">
            <div>
              <Label htmlFor="is_free">آزمون رایگان</Label>
              <p className="text-xs text-muted-foreground">
                در صورت غیرفعال بودن، این آزمون فقط برای کاربران دارای اشتراک فعال در دسترس است.
              </p>
            </div>
            <Switch
              id="is_free"
              checked={values.is_free}
              onCheckedChange={(v) => set("is_free", v)}
            />
          </div>
          {!values.is_free && (
            <div className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground md:col-span-2">
              این آزمون «ویژه اشتراک» است؛ قیمت جداگانه‌ای برای آن دریافت نمی‌شود.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تنظیمات برگزاری</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="duration">مدت آزمون (دقیقه)</Label>
            <Input
              id="duration"
              type="number"
              min={1}
              value={values.duration_minutes}
              onChange={(e) => set("duration_minutes", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="attempts">حداکثر تلاش</Label>
            <Input
              id="attempts"
              type="number"
              min={1}
              value={values.max_attempts}
              onChange={(e) => set("max_attempts", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="passing">نمره قبولی (درصد)</Label>
            <Input
              id="passing"
              type="number"
              min={0}
              max={100}
              value={values.passing_score}
              onChange={(e) => set("passing_score", Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="year">سال</Label>
            <Input
              id="year"
              inputMode="numeric"
              value={values.year}
              onChange={(e) => set("year", e.target.value)}
              placeholder="۱۴۰۳"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="period">دوره</Label>
            <Input
              id="period"
              value={values.period}
              onChange={(e) => set("period", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="round">نوبت</Label>
            <Input id="round" value={values.round} onChange={(e) => set("round", e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <Label htmlFor="rq">ترتیب تصادفی سوالات</Label>
            <Switch
              id="rq"
              checked={values.randomize_questions}
              onCheckedChange={(v) => set("randomize_questions", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <Label htmlFor="ro">ترتیب تصادفی گزینه‌ها</Label>
            <Switch
              id="ro"
              checked={values.randomize_options}
              onCheckedChange={(v) => set("randomize_options", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border p-3">
            <Label htmlFor="sca">نمایش پاسخ صحیح</Label>
            <Switch
              id="sca"
              checked={values.show_correct_answers}
              onCheckedChange={(v) => set("show_correct_answers", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>سئو</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="meta_title">عنوان سئو</Label>
            <Input
              id="meta_title"
              value={values.meta_title}
              onChange={(e) => set("meta_title", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keywords">کلیدواژه‌ها</Label>
            <Input
              id="keywords"
              value={values.keywords}
              onChange={(e) => set("keywords", e.target.value)}
              placeholder="با ویرگول جدا کنید"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="meta_description">توضیح سئو</Label>
            <Textarea
              id="meta_description"
              value={values.meta_description}
              onChange={(e) => set("meta_description", e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {examId ? "ذخیره تغییرات" : "ایجاد آزمون"}
        </Button>
        {examId && values.status !== "published" && (
          <Button
            type="button"
            variant="secondary"
            disabled={setStatus.isPending}
            onClick={() => {
              set("status", "published");
              setStatus.mutate({ id: examId, status: "published" });
            }}
          >
            <Send className="size-4" />
            انتشار آزمون
          </Button>
        )}
        {examId && values.status === "published" && (
          <Button
            type="button"
            variant="secondary"
            disabled={setStatus.isPending}
            onClick={() => {
              set("status", "draft");
              setStatus.mutate({ id: examId, status: "draft" });
            }}
          >
            <RotateCcw className="size-4" />
            بازگشت به پیش‌نویس
          </Button>
        )}
        {examId && values.status !== "archived" && (
          <Button
            type="button"
            variant="outline"
            disabled={setStatus.isPending}
            onClick={() => {
              set("status", "archived");
              setStatus.mutate({ id: examId, status: "archived" });
            }}
          >
            <Archive className="size-4" />
            بایگانی
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          onClick={() => void navigate({ to: "/admin/exams" })}
        >
          بازگشت به فهرست
        </Button>
      </div>

      {examId && <ExamSubjectsEditor examId={examId} />}
    </form>
  );
}
