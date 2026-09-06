import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { PageToolbar } from "@/components/admin/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/supabase-rpc";
import { adminError } from "@/lib/admin/error-messages";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";

export const Route = createFileRoute("/admin/plans")({
  head: () => ({
    meta: [
      { title: "پلن‌ها | پنل مدیریت همراه استخدام" },
      { name: "description", content: "مدیریت پلن‌های اشتراک سامانه، قیمت، سهمیه و مدت آن‌ها." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "پلن‌ها | پنل مدیریت" },
      { property: "og:description", content: "پلن‌های اشتراک، قیمت‌ها و سهمیه‌ها." },
    ],
  }),
  component: PlansPage,
});

type PlanRow = {
  id: string;
  title: string;
  price: number;
  currency: string;
  duration_months: number;
  exam_quota: number | null;
  practice_quota: number | null;
  features: unknown;
  is_active: boolean;
  display_order: number;
  archived_at: string | null;
  created_at: string;
};

type PlanValues = {
  title: string;
  price: number;
  currency: string;
  duration_months: number;
  exam_quota: number | null;
  practice_quota: number | null;
  features: string[];
  is_active: boolean;
  display_order: number;
};

function featureList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function PlansPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [deleting, setDeleting] = useState<PlanRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const query = useQuery({
    queryKey: ["admin-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select(
          "id,title,price,currency,duration_months,exam_quota,practice_quota,features,is_active,display_order,archived_at,created_at",
        )
        .order("display_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PlanRow[];
    },
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-plans"] });
    void qc.invalidateQueries({ queryKey: ["plans"] });
  };

  const saveMut = useMutation({
    mutationFn: (vals: PlanValues & { id: string | null }) =>
      rpc<{ mode: string }>("admin_save_plan", {
        p_id: vals.id,
        p_title: vals.title,
        p_price: vals.price,
        p_duration_months: vals.duration_months,
        p_is_active: vals.is_active,
        p_display_order: vals.display_order,
        p_currency: vals.currency,
        p_exam_quota: vals.exam_quota,
        p_practice_quota: vals.practice_quota,
        p_features: vals.features,
        p_reason: vals.id ? "ویرایش پلن از پنل مدیریت" : "ایجاد پلن از پنل مدیریت",
      }),
    onSuccess: (_d, vars) => {
      invalidate();
      setOpen(false);
      toast.success(vars.id ? "پلن به‌روزرسانی شد" : "پلن ایجاد شد");
    },
    onError: (e) => toast.error(adminError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      rpc<{ mode: string; active_subscriptions: number }>("admin_delete_plan", {
        p_id: v.id,
        p_reason: v.reason,
      }),
    onSuccess: (res) => {
      invalidate();
      setDeleting(null);
      setDeleteReason("");
      toast.success(
        res.mode === "archived"
          ? "پلن به دلیل وجود اشتراک یا پرداخت مرتبط، آرشیو شد"
          : "پلن حذف شد",
      );
    },
    onError: (e) => toast.error(adminError(e)),
  });

  const term = search.trim();
  const rows = (query.data ?? [])
    .filter((r) => (showArchived ? true : !r.archived_at))
    .filter((r) => (term ? r.title.includes(term) : true));

  const columns: Column<PlanRow>[] = [
    {
      key: "title",
      header: "عنوان",
      cell: (r) => (
        <div>
          <span className="font-medium">{r.title}</span>
          {featureList(r.features).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {featureList(r.features)
                .slice(0, 3)
                .map((f) => (
                  <Badge key={f} variant="outline" className="text-[10px]">
                    {f}
                  </Badge>
                ))}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "price",
      header: "قیمت",
      cell: (r) => formatPrice(r.price, r.currency === "IRR" ? "ریال" : "تومان"),
    },
    { key: "duration", header: "مدت", cell: (r) => `${formatNumber(r.duration_months)} ماه` },
    {
      key: "quota",
      header: "سهمیه",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          آزمون: {r.exam_quota == null ? "نامحدود" : formatNumber(r.exam_quota)} — تمرین:{" "}
          {r.practice_quota == null ? "نامحدود" : formatNumber(r.practice_quota)}
        </span>
      ),
    },
    {
      key: "status",
      header: "وضعیت",
      cell: (r) =>
        r.archived_at ? (
          <Badge variant="outline" className="gap-1">
            <Archive className="size-3" /> آرشیو
          </Badge>
        ) : (
          <Badge variant={r.is_active ? "default" : "secondary"}>
            {r.is_active ? "فعال" : "غیرفعال"}
          </Badge>
        ),
    },
    { key: "order", header: "ترتیب", cell: (r) => formatNumber(r.display_order) },
    {
      key: "created",
      header: "ایجاد",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "عملیات",
      className: "w-28",
      cell: (r) => (
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="ویرایش پلن"
            onClick={() => {
              setEditing(r);
              setOpen(true);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="حذف یا آرشیو پلن"
            className="text-destructive"
            onClick={() => {
              setDeleteReason("");
              setDeleting(r);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="پلن‌ها"
        description="مدیریت پلن‌های اشتراک، قیمت‌ها و سهمیه‌ها"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            پلن جدید
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        onRetry={() => void query.refetch()}
        rowKey={(r) => r.id}
        emptyTitle="پلنی ثبت نشده است"
        emptyDescription="اولین پلن اشتراک را ایجاد کنید."
        toolbar={
          <PageToolbar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="جست‌وجوی عنوان پلن…"
            filters={
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Switch checked={showArchived} onCheckedChange={setShowArchived} />
                نمایش آرشیوشده‌ها
              </label>
            }
          />
        }
      />

      <PlanDialog
        key={editing?.id ?? "new"}
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        saving={saveMut.isPending}
        onSave={(v) => saveMut.mutate({ ...v, id: editing?.id ?? null })}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o) {
            setDeleting(null);
            setDeleteReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف یا آرشیو پلن</AlertDialogTitle>
            <AlertDialogDescription>
              اگر برای «{deleting?.title}» اشتراک یا پرداختی ثبت شده باشد، به‌جای حذف، پلن آرشیو
              می‌شود تا سوابق مالی حفظ شوند. ثبت دلیل الزامی است.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="plan-delete-reason">دلیل</Label>
            <Textarea
              id="plan-delete-reason"
              rows={3}
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="مثلاً: پلن جایگزین شده است"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteReason.trim().length < 5 || deleteMut.isPending}
              onClick={() =>
                deleting && deleteMut.mutate({ id: deleting.id, reason: deleteReason.trim() })
              }
            >
              {deleteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "تأیید"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlanDialog({
  open,
  onOpenChange,
  editing,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: PlanRow | null;
  saving: boolean;
  onSave: (v: PlanValues) => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [price, setPrice] = useState(editing?.price ?? 0);
  const [currency, setCurrency] = useState(editing?.currency ?? "IRT");
  const [months, setMonths] = useState(editing?.duration_months ?? 1);
  const [examQuota, setExamQuota] = useState(
    editing?.exam_quota == null ? "" : String(editing.exam_quota),
  );
  const [practiceQuota, setPracticeQuota] = useState(
    editing?.practice_quota == null ? "" : String(editing.practice_quota),
  );
  const [features, setFeatures] = useState(featureList(editing?.features).join("\n"));
  const [active, setActive] = useState(editing?.is_active ?? true);
  const [order, setOrder] = useState(editing?.display_order ?? 0);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (t.length < 2) return setError("عنوان پلن باید حداقل ۲ کاراکتر باشد");
    if (!Number.isFinite(Number(price)) || Number(price) < 0)
      return setError("قیمت نمی‌تواند منفی باشد");
    if (Number(months) < 1 || Number(months) > 60) return setError("مدت باید بین ۱ تا ۶۰ ماه باشد");
    const parsedFeatures = features
      .split("\n")
      .map((f) => f.trim())
      .filter(Boolean)
      .slice(0, 20);
    setError(null);
    onSave({
      title: t,
      price: Number(price),
      currency,
      duration_months: Number(months),
      exam_quota: examQuota.trim() === "" ? null : Number(examQuota),
      practice_quota: practiceQuota.trim() === "" ? null : Number(practiceQuota),
      features: parsedFeatures,
      is_active: active,
      display_order: Number(order) || 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش پلن" : "پلن جدید"}</DialogTitle>
          <DialogDescription>
            مشخصات پلن اشتراک را وارد کنید. سهمیه خالی به‌معنای نامحدود است.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="plan-title">عنوان</Label>
            <Input
              id="plan-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-price">قیمت</Label>
              <Input
                id="plan-price"
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>واحد پول</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IRT">تومان (IRT)</SelectItem>
                  <SelectItem value="IRR">ریال (IRR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-months">مدت (ماه)</Label>
              <Input
                id="plan-months"
                type="number"
                min={1}
                max={60}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-exam-quota">سهمیه آزمون</Label>
              <Input
                id="plan-exam-quota"
                type="number"
                min={0}
                placeholder="نامحدود"
                value={examQuota}
                onChange={(e) => setExamQuota(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-practice-quota">سهمیه تمرین</Label>
              <Input
                id="plan-practice-quota"
                type="number"
                min={0}
                placeholder="نامحدود"
                value={practiceQuota}
                onChange={(e) => setPracticeQuota(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-features">امکانات (هر خط یک مورد)</Label>
            <Textarea
              id="plan-features"
              rows={3}
              value={features}
              onChange={(e) => setFeatures(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-order">ترتیب نمایش</Label>
              <Input
                id="plan-order"
                type="number"
                min={0}
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <Switch checked={active} onCheckedChange={setActive} />
              پلن فعال باشد
            </label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : "ذخیره"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
