import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
import { formatNumber, formatPrice } from "@/lib/format";
import { humanizeShopError } from "@/lib/shop-errors";
import {
  PRODUCT_STATUS_LABELS,
  shopRpc,
  type ShopCategory,
  type ShopProduct,
} from "@/lib/shop-rpc";

export const Route = createFileRoute("/admin/shop/products")({
  head: () => ({
    meta: [
      { title: "محصولات فروشگاه | همراه استخدام" },
      { name: "description", content: "مدیریت محصولات فروشگاه" },
    ],
  }),
  component: ShopProductsPage,
});

const EMPTY = {
  id: null as string | null,
  title: "",
  slug: "",
  category_id: "",
  summary: "",
  description: "",
  price: 0,
  compare_at_price: "",
  images: "",
  sku: "",
  stock: 0,
  stock_unlimited: false,
  status: "draft",
  is_featured: false,
  display_order: 0,
  meta_title: "",
  meta_description: "",
  product_link: "",
};

function ShopProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [deleting, setDeleting] = useState<ShopProduct | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["admin-shop-categories"],
    queryFn: () => shopRpc<ShopCategory[]>("admin_shop_list_categories"),
  });

  const query = useQuery({
    queryKey: ["admin-shop-products", search, status, category],
    queryFn: () =>
      shopRpc<ShopProduct[]>("admin_shop_list_products", {
        p_search: search.trim() || null,
        p_status: status === "all" ? null : status,
        p_category_id: category === "all" ? null : category,
      }),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const savedId = await shopRpc<string>("admin_save_product", {
        p_id: form.id,
        p_title: form.title.trim(),
        p_slug: form.slug.trim(),
        p_category_id: form.category_id || null,
        p_summary: form.summary.trim() || null,
        p_description: form.description.trim() || null,
        p_price: Number(form.price) || 0,
        p_compare_at_price: form.compare_at_price ? Number(form.compare_at_price) : null,
        p_images: form.images
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        p_sku: form.sku.trim() || null,
        p_stock: Number(form.stock) || 0,
        p_stock_unlimited: form.stock_unlimited,
        p_status: form.status,
        p_is_featured: form.is_featured,
        p_display_order: Number(form.display_order) || 0,
        p_meta_title: form.meta_title.trim() || null,
        p_meta_description: form.meta_description.trim() || null,
      });
      await shopRpc("admin_save_product_link", {
        p_id: form.id ?? savedId,
        p_product_link: form.product_link.trim() || null,
      });
      return savedId;
    },
    onSuccess: () => {
      toast.success("محصول ذخیره شد.");
      void qc.invalidateQueries({ queryKey: ["admin-shop-products"] });
      setOpen(false);
    },
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => shopRpc("admin_delete_product", { p_id: id }),
    onSuccess: () => {
      toast.success("محصول حذف شد.");
      void qc.invalidateQueries({ queryKey: ["admin-shop-products"] });
      setDeleting(null);
    },
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const rows = query.data ?? [];
  const categories = categoriesQuery.data ?? [];

  const openNew = () => {
    setForm({ ...EMPTY });
    setOpen(true);
  };

  const openEdit = (row: ShopProduct) => {
    setForm({
      id: row.id,
      title: row.title,
      slug: row.slug,
      category_id: row.category_id ?? "",
      summary: row.summary ?? "",
      description: row.description ?? "",
      price: row.price,
      compare_at_price: row.compare_at_price ? String(row.compare_at_price) : "",
      images: (row.images ?? []).join("\n"),
      sku: row.sku ?? "",
      stock: row.stock,
      stock_unlimited: row.stock_unlimited,
      status: row.status ?? "draft",
      is_featured: row.is_featured,
      display_order: row.display_order ?? 0,
      meta_title: row.meta_title ?? "",
      meta_description: row.meta_description ?? "",
      product_link: row.product_link ?? "",
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="محصولات فروشگاه"
        description="افزودن، ویرایش و مدیریت موجودی محصولات"
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            محصول جدید
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در عنوان یا کد محصول"
            className="pe-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه وضعیت‌ها</SelectItem>
            <SelectItem value="draft">پیش‌نویس</SelectItem>
            <SelectItem value="published">منتشرشده</SelectItem>
            <SelectItem value="archived">بایگانی</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه دسته‌ها</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="محصولی یافت نشد" description="محصول جدیدی اضافه کنید." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>عنوان</TableHead>
                <TableHead>دسته</TableHead>
                <TableHead>قیمت</TableHead>
                <TableHead>موجودی</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="text-end">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.category_name ?? "—"}
                  </TableCell>
                  <TableCell>{formatPrice(row.price)}</TableCell>
                  <TableCell>{row.stock_unlimited ? "نامحدود" : formatNumber(row.stock)}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "published" ? "default" : "secondary"}>
                      {PRODUCT_STATUS_LABELS[row.status ?? "draft"] ?? row.status}
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
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "ویرایش محصول" : "محصول جدید"}</DialogTitle>
            <DialogDescription>اطلاعات محصول فروشگاه (مبالغ به تومان)</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="title">عنوان</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pslug">نامک (انگلیسی)</Label>
              <Input
                id="pslug"
                dir="ltr"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pcat">دسته‌بندی</Label>
              <Select
                value={form.category_id || "none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category_id: v === "none" ? "" : v }))
                }
              >
                <SelectTrigger id="pcat">
                  <SelectValue placeholder="بدون دسته" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون دسته</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sku">کد محصول</Label>
              <Input
                id="sku"
                dir="ltr"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="price">قیمت (تومان)</Label>
              <Input
                id="price"
                type="number"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="compare">قیمت پیش از تخفیف</Label>
              <Input
                id="compare"
                type="number"
                value={form.compare_at_price}
                onChange={(e) => setForm((f) => ({ ...f, compare_at_price: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="stock">موجودی</Label>
              <Input
                id="stock"
                type="number"
                disabled={form.stock_unlimited}
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="order2">ترتیب نمایش</Label>
              <Input
                id="order2"
                type="number"
                value={form.display_order}
                onChange={(e) =>
                  setForm((f) => ({ ...f, display_order: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="unlimited">موجودی نامحدود</Label>
              <Switch
                id="unlimited"
                checked={form.stock_unlimited}
                onCheckedChange={(v) => setForm((f) => ({ ...f, stock_unlimited: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="featured">محصول ویژه</Label>
              <Switch
                id="featured"
                checked={form.is_featured}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_featured: v }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pstatus">وضعیت</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger id="pstatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">پیش‌نویس</SelectItem>
                  <SelectItem value="published">منتشرشده</SelectItem>
                  <SelectItem value="archived">بایگانی</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="plink">لینک محصول (پس از پرداخت پیامک می‌شود)</Label>
              <Input
                id="plink"
                dir="ltr"
                placeholder="https://..."
                value={form.product_link}
                onChange={(e) => setForm((f) => ({ ...f, product_link: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                این لینک پس از پرداخت موفق، به‌صورت خودکار با پنل پیامکی برای مشتری ارسال می‌شود.
              </p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="images">تصاویر (هر خط یک نشانی)</Label>
              <Textarea
                id="images"
                dir="ltr"
                rows={3}
                value={form.images}
                onChange={(e) => setForm((f) => ({ ...f, images: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="summary">خلاصه</Label>
              <Textarea
                id="summary"
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="pdesc">توضیحات کامل</Label>
              <Textarea
                id="pdesc"
                rows={5}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mtitle">عنوان سئو</Label>
              <Input
                id="mtitle"
                value={form.meta_title}
                onChange={(e) => setForm((f) => ({ ...f, meta_title: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mdesc">توضیح سئو</Label>
              <Input
                id="mdesc"
                value={form.meta_description}
                onChange={(e) => setForm((f) => ({ ...f, meta_description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              انصراف
            </Button>
            <Button
              disabled={!form.title.trim() || !form.slug.trim() || saveMut.isPending}
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
            <AlertDialogTitle>حذف محصول</AlertDialogTitle>
            <AlertDialogDescription>
              محصول «{deleting?.title}» بایگانی و از فروشگاه حذف شود؟
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
