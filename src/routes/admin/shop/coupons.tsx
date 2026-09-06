import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/data-states";
import { formatDate, formatNumber, formatPrice } from "@/lib/format";
import { humanizeShopError } from "@/lib/shop-errors";
import { shopRpc } from "@/lib/shop-rpc";

export const Route = createFileRoute("/admin/shop/coupons")({
  head: () => ({
    meta: [
      { title: "کدهای تخفیف فروشگاه | همراه استخدام" },
      { name: "description", content: "مدیریت کدهای تخفیف فروشگاه همراه استخدام" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ShopCouponsPage,
});

type CouponRow = {
  id: string;
  code: string;
  title: string | null;
  discount_type: string;
  discount_value: number;
  min_purchase: number;
  max_uses: number | null;
  used_count: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
};

const EMPTY = {
  id: null as string | null,
  code: "",
  title: "",
  discount_type: "percent",
  discount_value: "0",
  min_purchase: "0",
  max_uses: "",
  is_active: true,
  starts_at: "",
  expires_at: "",
};

const toIso = (value: string) => (value ? new Date(`${value}T00:00:00`).toISOString() : null);
const toDateInput = (value: string | null) => (value ? value.slice(0, 10) : "");

function ShopCouponsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleting, setDeleting] = useState<CouponRow | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const query = useQuery({
    queryKey: ["admin-shop-coupons"],
    queryFn: () => shopRpc<CouponRow[]>("admin_shop_list_coupons"),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin-shop-coupons"] });
    void qc.invalidateQueries({ queryKey: ["shop-coupons"] });
  };

  const saveMut = useMutation({
    mutationFn: () =>
      shopRpc<string>("admin_save_coupon", {
        p_id: form.id,
        p_code: form.code.trim().toUpperCase(),
        p_title: form.title.trim() || null,
        p_discount_type: form.discount_type,
        p_discount_value: Number(form.discount_value) || 0,
        p_min_purchase: Number(form.min_purchase) || 0,
        p_max_uses: form.max_uses.trim() ? Number(form.max_uses) : null,
        p_is_active: form.is_active,
        p_starts_at: toIso(form.starts_at),
        p_expires_at: toIso(form.expires_at),
        p_reason: form.id ? "ویرایش کد تخفیف از پنل مدیریت" : "ایجاد کد تخفیف از پنل مدیریت",
      }),
    onSuccess: () => {
      toast.success("کد تخفیف ذخیره شد.");
      invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (row: CouponRow) =>
      shopRpc("admin_delete_coupon", { p_id: row.id, p_reason: deleteReason.trim() }),
    onSuccess: () => {
      toast.success("کد تخفیف حذف شد.");
      invalidate();
      setDeleting(null);
      setDeleteReason("");
    },
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((row) => {
      if (onlyActive && !row.is_active) return false;
      if (!term) return true;
      return (
        row.code.toLowerCase().includes(term) || (row.title ?? "").toLowerCase().includes(term)
      );
    });
  }, [query.data, search, onlyActive]);

  const openNew = () => {
    setForm({ ...EMPTY });
    setOpen(true);
  };

  const openEdit = (row: CouponRow) => {
    setForm({
      id: row.id,
      code: row.code,
      title: row.title ?? "",
      discount_type: row.discount_type,
      discount_value: String(row.discount_value ?? 0),
      min_purchase: String(row.min_purchase ?? 0),
      max_uses: row.max_uses == null ? "" : String(row.max_uses),
      is_active: row.is_active,
      starts_at: toDateInput(row.starts_at),
      expires_at: toDateInput(row.expires_at),
    });
    setOpen(true);
  };

  const validationError = (): string | null => {
    if (form.code.trim().length < 2) return "کد تخفیف باید حداقل ۲ کاراکتر باشد.";
    const value = Number(form.discount_value);
    if (!Number.isFinite(value) || value <= 0) return "مقدار تخفیف باید بزرگ‌تر از صفر باشد.";
    if (form.discount_type === "percent" && value > 100)
      return "درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد.";
    if (Number(form.min_purchase) < 0) return "حداقل خرید نمی‌تواند منفی باشد.";
    if (form.max_uses.trim() && Number(form.max_uses) <= 0)
      return "سقف مصرف باید عددی بزرگ‌تر از صفر باشد.";
    if (form.starts_at && form.expires_at && form.expires_at < form.starts_at)
      return "تاریخ پایان نمی‌تواند پیش از تاریخ شروع باشد.";
    return null;
  };

  const submit = () => {
    const error = validationError();
    if (error) {
      toast.error(error);
      return;
    }
    saveMut.mutate();
  };

  return (
    <div>
      <PageHeader
        title="کدهای تخفیف"
        description="کدهای تخفیف فروشگاه را ایجاد و مدیریت کنید"
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            کد تخفیف جدید
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input
          className="max-w-xs"
          placeholder="جستجو در کد یا عنوان…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Switch id="only-active" checked={onlyActive} onCheckedChange={setOnlyActive} />
          <Label htmlFor="only-active">فقط کدهای فعال</Label>
        </div>
      </div>

      {query.isLoading ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="کد تخفیفی یافت نشد" description="اولین کد تخفیف را ایجاد کنید." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>کد</TableHead>
                <TableHead>عنوان</TableHead>
                <TableHead>تخفیف</TableHead>
                <TableHead>حداقل خرید</TableHead>
                <TableHead>مصرف</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>بازه اعتبار</TableHead>
                <TableHead className="text-end">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell dir="ltr" className="text-start font-mono font-medium">
                    {row.code}
                  </TableCell>
                  <TableCell>{row.title ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {row.discount_type === "percent"
                        ? `${formatNumber(row.discount_value)}٪`
                        : formatPrice(row.discount_value)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.min_purchase > 0 ? formatPrice(row.min_purchase) : "—"}
                  </TableCell>
                  <TableCell>
                    {formatNumber(row.used_count)}
                    {row.max_uses != null ? ` از ${formatNumber(row.max_uses)}` : ""}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? "default" : "secondary"}>
                      {row.is_active ? "فعال" : "غیرفعال"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.starts_at || row.expires_at
                      ? `${row.starts_at ? formatDate(row.starts_at) : "—"} تا ${
                          row.expires_at ? formatDate(row.expires_at) : "—"
                        }`
                      : "بدون محدودیت"}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        setDeleteReason("");
                        setDeleting(row);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش کد تخفیف" : "کد تخفیف جدید"}</DialogTitle>
            <DialogDescription>مشخصات کد تخفیف فروشگاه را تعیین کنید</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="code">کد تخفیف</Label>
              <Input
                id="code"
                dir="ltr"
                className="font-mono"
                value={form.code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase().trim() }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="title">عنوان</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="discount-type">نوع تخفیف</Label>
              <Select
                value={form.discount_type}
                onValueChange={(v) => setForm((f) => ({ ...f, discount_type: v }))}
              >
                <SelectTrigger id="discount-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">درصدی</SelectItem>
                  <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="discount-value">
                {form.discount_type === "percent" ? "درصد تخفیف" : "مبلغ تخفیف (تومان)"}
              </Label>
              <Input
                id="discount-value"
                type="number"
                min={0}
                max={form.discount_type === "percent" ? 100 : undefined}
                value={form.discount_value}
                onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="min-purchase">حداقل خرید (تومان)</Label>
              <Input
                id="min-purchase"
                type="number"
                min={0}
                value={form.min_purchase}
                onChange={(e) => setForm((f) => ({ ...f, min_purchase: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="max-uses">سقف مصرف (اختیاری)</Label>
              <Input
                id="max-uses"
                type="number"
                min={1}
                placeholder="نامحدود"
                value={form.max_uses}
                onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="starts-at">تاریخ شروع</Label>
              <Input
                id="starts-at"
                type="date"
                dir="ltr"
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expires-at">تاریخ پایان</Label>
              <Input
                id="expires-at"
                type="date"
                dir="ltr"
                value={form.expires_at}
                onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch
                id="is-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
              <Label htmlFor="is-active">فعال باشد</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button disabled={saveMut.isPending} onClick={submit}>
              {saveMut.isPending && <Loader2 className="size-4 animate-spin" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v) {
            setDeleting(null);
            setDeleteReason("");
          }
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف کد تخفیف</AlertDialogTitle>
            <AlertDialogDescription>
              کد «{deleting?.code}» حذف شود؟ این عمل قابل بازگشت نیست. لطفاً دلیل حذف را وارد کنید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="delete-reason">دلیل حذف (حداقل ۵ کاراکتر)</Label>
            <Textarea
              id="delete-reason"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteReason.trim().length < 5 || deleteMut.isPending}
              onClick={() => deleting && deleteMut.mutate(deleting)}
            >
              {deleteMut.isPending && <Loader2 className="size-4 animate-spin" />}
              حذف
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
