import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BadgePercent, Boxes, PackageOpen, ShoppingBag, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState, PageHeader } from "@/components/data-states";
import { formatNumber, formatPrice } from "@/lib/format";
import { shopRpc } from "@/lib/shop-rpc";

export const Route = createFileRoute("/admin/shop/")({
  head: () => ({
    meta: [
      { title: "مدیریت فروشگاه | همراه استخدام" },
      { name: "description", content: "نمای کلی فروشگاه، سفارش‌ها و درآمد" },
    ],
  }),
  component: ShopOverviewPage,
});

type Overview = {
  products_count: number;
  published_count: number;
  low_stock_count: number;
  orders_count: number;
  pending_orders: number;
  revenue: number;
  top_products: { title: string; quantity: number; revenue: number }[];
};

function ShopOverviewPage() {
  const query = useQuery({
    queryKey: ["admin-shop-overview"],
    queryFn: () => shopRpc<Overview>("admin_shop_overview", { p_days: 30 }),
  });

  const data = query.data;

  const stats = data
    ? [
        { label: "محصولات", value: formatNumber(data.products_count), icon: Boxes },
        { label: "منتشرشده", value: formatNumber(data.published_count), icon: ShoppingBag },
        { label: "سفارش‌های ۳۰ روز", value: formatNumber(data.orders_count), icon: PackageOpen },
        { label: "در انتظار پرداخت", value: formatNumber(data.pending_orders), icon: BadgePercent },
        { label: "درآمد ۳۰ روز", value: formatPrice(data.revenue), icon: TrendingUp },
        { label: "موجودی کم", value: formatNumber(data.low_stock_count), icon: Boxes },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="فروشگاه"
        description="نمای کلی عملکرد فروشگاه در ۳۰ روز گذشته"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/admin/shop/products">محصولات</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/shop/categories">دسته‌بندی‌ها</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/shop/orders">سفارش‌ها</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/shop/coupons">کدهای تخفیف</Link>
            </Button>
          </div>
        }
      />

      {query.isLoading ? (
        <LoadingState rows={3} />
      ) : query.isError || !data ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((s) => (
              <Card key={s.label}>
                <CardContent className="flex items-center gap-3 py-4">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="size-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <p className="text-lg font-bold">{s.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">پرفروش‌ترین محصولات</CardTitle>
            </CardHeader>
            <CardContent>
              {data.top_products.length === 0 ? (
                <p className="text-sm text-muted-foreground">هنوز فروشی ثبت نشده است.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.top_products.map((p) => (
                    <li key={p.title} className="flex items-center justify-between gap-2">
                      <span className="truncate">{p.title}</span>
                      <span className="text-muted-foreground">
                        {formatNumber(p.quantity)} عدد — {formatPrice(p.revenue)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
