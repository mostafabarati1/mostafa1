import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search, Settings2 } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/data-states";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/format";
import { humanizeShopError } from "@/lib/shop-errors";
import { ORDER_STATUS_LABELS, shopRpc, type ShopOrder } from "@/lib/shop-rpc";

export const Route = createFileRoute("/admin/shop/orders")({
  head: () => ({
    meta: [
      { title: "سفارش‌های فروشگاه | همراه استخدام" },
      { name: "description", content: "مدیریت و پیگیری سفارش‌های فروشگاه" },
    ],
  }),
  component: ShopOrdersPage,
});

function ShopOrdersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<ShopOrder | null>(null);
  const [nextStatus, setNextStatus] = useState("paid");
  const [tracking, setTracking] = useState("");
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["admin-shop-orders", search, status],
    queryFn: () =>
      shopRpc<ShopOrder[]>("admin_shop_list_orders", {
        p_status: status === "all" ? null : status,
        p_search: search.trim() || null,
      }),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      shopRpc("admin_update_order_status", {
        p_order_id: editing?.id,
        p_status: nextStatus,
        p_tracking_code: tracking.trim() || null,
        p_reason: reason.trim() || null,
      }),
    onSuccess: () => {
      toast.success("وضعیت سفارش به‌روزرسانی شد.");
      void qc.invalidateQueries({ queryKey: ["admin-shop-orders"] });
      setEditing(null);
    },
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const rows = query.data ?? [];

  const openEdit = (order: ShopOrder) => {
    setEditing(order);
    setNextStatus(order.status === "pending" ? "paid" : order.status);
    setTracking(order.tracking_code ?? "");
    setReason("");
  };

  return (
    <div>
      <PageHeader title="سفارش‌های فروشگاه" description="بررسی، پیگیری و تغییر وضعیت سفارش‌ها" />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو بر اساس نام، ایمیل یا شناسه سفارش"
            className="pe-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه وضعیت‌ها</SelectItem>
            <SelectItem value="pending">در انتظار پرداخت</SelectItem>
            <SelectItem value="paid">پرداخت‌شده</SelectItem>
            <SelectItem value="cancelled">لغو شده</SelectItem>
            <SelectItem value="refunded">بازگشت وجه</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="سفارشی یافت نشد" description="هنوز سفارشی با این فیلترها وجود ندارد." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>شناسه</TableHead>
                <TableHead>کاربر</TableHead>
                <TableHead>اقلام</TableHead>
                <TableHead>مبلغ</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead>تاریخ</TableHead>
                <TableHead className="text-end">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => (
                <TableRow key={order.id}>
                  <TableCell dir="ltr" className="text-start font-mono text-xs">
                    {order.id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{order.user_name ?? "—"}</div>
                    <div dir="ltr" className="text-start text-xs text-muted-foreground">
                      {order.user_email ?? ""}
                    </div>
                  </TableCell>
                  <TableCell>{formatNumber(order.items_count)}</TableCell>
                  <TableCell>{formatPrice(order.total_amount)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        order.status === "paid"
                          ? "default"
                          : order.status === "pending"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(order.created_at)}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(order)}>
                      <Settings2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>مدیریت سفارش</DialogTitle>
            <DialogDescription>تغییر وضعیت و ثبت کد رهگیری برای سفارش انتخاب‌شده</DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 text-sm">
                <ul className="space-y-1">
                  {editing.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {item.title} × {item.quantity}
                      </span>
                      <span>{formatPrice(item.total)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between border-t pt-2 font-semibold">
                  <span>مبلغ کل</span>
                  <span>{formatPrice(editing.total_amount)}</span>
                </div>
                {editing.ref_id && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    کد پیگیری پرداخت: <span dir="ltr">{editing.ref_id}</span>
                  </p>
                )}
              </div>

              {editing.shipping_address && (
                <div className="rounded-lg border p-3 text-sm leading-7">
                  <p className="font-medium">اطلاعات ارسال</p>
                  {Object.entries(editing.shipping_address).map(([key, value]) => (
                    <p key={key} className="text-muted-foreground">
                      {value}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="ostatus">وضعیت جدید</Label>
                  <Select value={nextStatus} onValueChange={setNextStatus}>
                    <SelectTrigger id="ostatus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">در انتظار پرداخت</SelectItem>
                      <SelectItem value="paid">پرداخت‌شده</SelectItem>
                      <SelectItem value="cancelled">لغو شده</SelectItem>
                      <SelectItem value="refunded">بازگشت وجه</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tracking">کد رهگیری پستی</Label>
                  <Input
                    id="tracking"
                    dir="ltr"
                    value={tracking}
                    onChange={(e) => setTracking(e.target.value)}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="reason">دلیل / توضیح</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              انصراف
            </Button>
            <Button disabled={updateMut.isPending} onClick={() => updateMut.mutate()}>
              {updateMut.isPending && <Loader2 className="size-4 animate-spin" />}
              ثبت تغییرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
