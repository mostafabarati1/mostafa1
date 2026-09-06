import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/data-states";
import { formatPrice } from "@/lib/format";
import { humanizeShopError } from "@/lib/shop-errors";
import { shopRpc, type ShopCartLine } from "@/lib/shop-rpc";

export const Route = createFileRoute("/_authenticated/cart")({
  head: () => ({
    meta: [
      { title: "سبد خرید | همراه استخدام" },
      { name: "description", content: "سبد خرید فروشگاه همراه استخدام" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["shop-cart"],
    queryFn: () => shopRpc<ShopCartLine[]>("shop_cart_get"),
  });

  const setQty = useMutation({
    mutationFn: (vars: { productId: string; quantity: number }) =>
      shopRpc("shop_cart_set_qty", { p_product_id: vars.productId, p_quantity: vars.quantity }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["shop-cart"] }),
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const clear = useMutation({
    mutationFn: () => shopRpc("shop_cart_clear"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["shop-cart"] }),
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const lines = query.data ?? [];
  const total = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);

  return (
    <div>
      <PageHeader
        title="سبد خرید"
        description="محصولات انتخابی خود را بررسی و نهایی کنید"
        actions={
          lines.length > 0 ? (
            <Button variant="outline" onClick={() => clear.mutate()} disabled={clear.isPending}>
              <Trash2 className="size-4" />
              خالی کردن سبد
            </Button>
          ) : undefined
        }
      />

      {query.isLoading ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : lines.length === 0 ? (
        <EmptyState
          title="سبد خرید خالی است"
          description="از فروشگاه محصول مورد نظر خود را انتخاب کنید."
        />
      ) : (
        <div className="space-y-4">
          {lines.map((line) => (
            <Card key={line.product_id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="size-16 overflow-hidden rounded-lg border bg-muted">
                  {line.image ? (
                    <img src={line.image} alt={line.title} className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-muted-foreground">
                      <ShoppingCart className="size-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{line.title}</p>
                  <p className="text-sm text-muted-foreground">{formatPrice(line.price)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="افزایش"
                    disabled={setQty.isPending}
                    onClick={() =>
                      setQty.mutate({ productId: line.product_id, quantity: line.quantity + 1 })
                    }
                  >
                    <Plus className="size-4" />
                  </Button>
                  <span className="w-10 text-center">{line.quantity}</span>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label="کاهش"
                    disabled={setQty.isPending}
                    onClick={() =>
                      setQty.mutate({ productId: line.product_id, quantity: line.quantity - 1 })
                    }
                  >
                    <Minus className="size-4" />
                  </Button>
                </div>
                <div className="w-28 text-end font-semibold">
                  {formatPrice(line.price * line.quantity)}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  aria-label="حذف"
                  onClick={() => setQty.mutate({ productId: line.product_id, quantity: 0 })}
                >
                  <Trash2 className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <span className="text-sm text-muted-foreground">جمع سبد</span>
              <span className="text-xl font-extrabold text-primary">{formatPrice(total)}</span>
              <Button asChild>
                <Link to="/checkout">
                  {setQty.isPending && <Loader2 className="size-4 animate-spin" />}
                  ادامه و تسویه حساب
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
