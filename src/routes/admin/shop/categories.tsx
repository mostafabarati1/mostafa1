import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  AlertDialogAction,
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
import { formatNumber } from "@/lib/format";
import { humanizeShopError } from "@/lib/shop-errors";
import { shopRpc, type ShopCategory } from "@/lib/shop-rpc";

export const Route = createFileRoute("/admin/shop/categories")({
  head: () => ({
    meta: [
      { title: "دسته‌بندی فروشگاه | همراه استخدام" },
      { name: "description", content: "مدیریت دسته‌بندی محصولات فروشگاه" },
    ],
  }),
  component: ShopCategoriesPage,
});

const EMPTY = {
  id: null as string | null,
  name: "",
  slug: "",
  description: "",
  parent_id: "",
  display_order: 0,
  status: "active",
};

function ShopCategoriesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleting, setDeleting] = useState<ShopCategory | null>(null);

  const query = useQuery({
    queryKey: ["admin-shop-categories"],
    queryFn: () => shopRpc<ShopCategory[]>("admin_shop_list_categories"),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      shopRpc<string>("admin_save_shop_category", {
        p_id: form.id,
        p_name: form.name.trim(),
        p_slug: form.slug.trim(),
        p_description: form.description.trim() || null,
        p_parent_id: form.parent_id || null,
        p_display_order: Number(form.display_order) || 0,
        p_status: form.status,
      }),
    onSuccess: () => {
      toast.success("دسته‌بندی ذخیره شد.");
      void qc.invalidateQueries({ queryKey: ["admin-shop-categories"] });
      setOpen(false);
    },
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => shopRpc("admin_delete_shop_category", { p_id: id }),
    onSuccess: () => {
      toast.success("دسته‌بندی حذف شد.");
      void qc.invalidateQueries({ queryKey: ["admin-shop-categories"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const rows = query.data ?? [];

  const openNew = () => {
    setForm({ ...EMPTY });
    setOpen(true);
  };

  const openEdit = (row: ShopCategory) => {
    setForm({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      parent_id: row.parent_id ?? "",
      display_order: row.display_order,
      status: row.status,
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="دسته‌بندی فروشگاه"
        description="ساختار دسته‌بندی محصولات را مدیریت کنید"
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            دسته‌بندی جدید
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="دسته‌بندی ثبت نشده" description="اولین دسته‌بندی را ایجاد کنید." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>نامک</TableHead>
                <TableHead>تعداد محصول</TableHead>
                <TableHead>ترتیب</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="text-end">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell dir="ltr" className="text-start text-muted-foreground">
                    {row.slug}
                  </TableCell>
                  <TableCell>{formatNumber(row.products_count ?? 0)}</TableCell>
                  <TableCell>{formatNumber(row.display_order)}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "active" ? "default" : "secondary"}>
                      {row.status === "active" ? "فعال" : "غیرفعال"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(row)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeleting(row)}
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
            <DialogTitle>{form.id ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"}</DialogTitle>
            <DialogDescription>اطلاعات دسته‌بندی محصولات فروشگاه</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="name">نام</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">نامک (انگلیسی)</Label>
              <Input
                id="slug"
                dir="ltr"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="parent">دسته والد</Label>
              <Select
                value={form.parent_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger id="parent">
                  <SelectValue placeholder="بدون والد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون والد</SelectItem>
                  {rows
                    .filter((r) => r.id !== form.id)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="order">ترتیب نمایش</Label>
              <Input
                id="order"
                type="number"
                value={form.display_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, display_order: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="status">وضعیت</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">فعال</SelectItem>
                  <SelectItem value="inactive">غیرفعال</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="desc">توضیحات</Label>
              <Textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button
              disabled={!form.name.trim() || !form.slug.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending && <Loader2 className="size-4 animate-spin" />}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف دسته‌بندی</AlertDialogTitle>
            <AlertDialogDescription>
              دسته‌بندی «{deleting?.name}» حذف شود؟ این عمل قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && deleteMut.mutate(deleting.id)}>
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
