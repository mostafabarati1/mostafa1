import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2, PackageOpen, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/data-states";
import { formatDateTime, formatPrice } from "@/lib/format";
import { humanizeShopError } from "@/lib/shop-errors";
import { ORDER_STATUS_LABELS, shopRpc, type ShopOrder } from "@/lib/shop-rpc";
import { reconcileShopPayment, startShopPayment } from "@/lib/shop.functions";

export const Route = createFileRoute("/_authenticated/my-orders")({
  head: () => ({
    meta: [
      { title: "سفارش‌های من | همراه استخدام" },
      { name: "description", content: "پیگیری سفارش‌های فروشگاه همراه استخدام" },
    ],
  }),
  component: MyOrdersPage,
});

function MyOrdersPage() {
  const qc = useQueryClient();
  const startPayment = useServerFn(startShopPayment);
  const reconcile = useServerFn(reconcileShopPayment);
  const [paying, setPaying] = useState<string | null>(null);
  const [reconciled, setReconciled] = useState(false);

  const query = useQuery({
    queryKey: ["my-orders"],
    // shop_my_orders خودش سفارش‌های pending با پرداخت تسویه‌شده را paid می‌کند (idempotent).
    queryFn: () => shopRpc<ShopOrder[]>("shop_my_orders"),
  });

  const orders = query.data ?? [];

  // مصالحه عمدی: صفحه نتیجه پرداخت موجود (payment-result) درباره سفارش چیزی نمی‌داند
  // و طبق قواعد پروژه تغییر نمی‌کند؛ بنابراین وضعیت سفارش اینجا قطعی می‌شود.
  useEffect(() => {
    if (reconciled || query.isLoading) return;
    const pending = orders.filter((o) => o.status === "pending");
    if (pending.length === 0) return;
    setReconciled(true);
    void (async () => {
      let changed = false;
      for (const order of pending) {
        try {
          const result = await reconcile({ data: { orderId: order.id } });
          if (result.order_status === "paid") changed = true;
        } catch {
          // نادیده گرفتن؛ سفارش در وضعیت pending باقی می‌ماند.
        }
      }
      if (changed) void qc.invalidateQueries({ queryKey: ["my-orders"] });
    })();
  }, [orders, query.isLoading, reconcile, reconciled, qc]);

  const cancelMut = useMutation({
    mutationFn: (orderId: string) =>
      shopRpc("shop_cancel_order", { p_order_id: orderId, p_reason: "لغو توسط کاربر" }),
    onSuccess: () => {
      toast.success("سفارش لغو شد.");
      void qc.invalidateQueries({ queryKey: ["my-orders"] });
    },
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const pay = async (orderId: string) => {
    setPaying(orderId);
    try {
      const result = await startPayment({ data: { orderId } });
      window.location.assign(result.redirect_url);
    } catch (e) {
      toast.error(humanizeShopError(e));
      setPaying(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="سفارش‌های من"
        description="وضعیت سفارش‌های فروشگاه و پرداخت آن‌ها"
        actions={
          <Button asChild variant="outline">
            <Link to="/shop">فروشگاه</Link>
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : orders.length === 0 ? (
        <EmptyState title="سفارشی ندارید" description="از فروشگاه اولین خرید خود را انجام دهید." />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="space-y-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PackageOpen className="size-5 text-primary" />
                    <span className="font-medium" dir="ltr">
                      {order.id.slice(0, 8)}
                    </span>
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
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatDateTime(order.created_at)}
                  </span>
                </div>

                <ul className="space-y-1 text-sm text-muted-foreground">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-2">
                      <span className="truncate">
                        {item.title} × {item.quantity}
                      </span>
                      <span>{formatPrice(item.total)}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <div className="text-sm">
                    {order.discount_amount > 0 && (
                      <span className="me-3 text-muted-foreground">
                        تخفیف: {formatPrice(order.discount_amount)}
                      </span>
                    )}
                    <span className="font-bold text-primary">
                      {formatPrice(order.total_amount)}
                    </span>
                    {order.tracking_code && (
                      <span className="ms-3 text-muted-foreground">
                        کد رهگیری: <span dir="ltr">{order.tracking_code}</span>
                      </span>
                    )}
                  </div>

                  {order.status === "pending" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={paying === order.id}
                        onClick={() => void pay(order.id)}
                      >
                        {paying === order.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <CreditCard className="size-4" />
                        )}
                        پرداخت
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={cancelMut.isPending}
                        onClick={() => cancelMut.mutate(order.id)}
                      >
                        <XCircle className="size-4" />
                        لغو سفارش
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
