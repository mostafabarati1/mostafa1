import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BadgePercent, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/data-states";
import { formatPrice } from "@/lib/format";
import { humanizeShopError } from "@/lib/shop-errors";
import { shopRpc, type ShopCartLine } from "@/lib/shop-rpc";
import { startShopPayment } from "@/lib/shop.functions";

export const Route = createFileRoute("/_authenticated/checkout")({
  head: () => ({
    meta: [
      { title: "تسویه حساب | همراه استخدام" },
      { name: "description", content: "ثبت آدرس و پرداخت سفارش فروشگاه" },
    ],
  }),
  component: CheckoutPage,
});

const shippingSchema = z.object({
  full_name: z.string().trim().min(3, "نام و نام خانوادگی را کامل وارد کنید."),
  mobile: z
    .string()
    .trim()
    .regex(/^09\d{9}$/, "شماره موبایل معتبر نیست."),
  province: z.string().trim().min(2, "استان را وارد کنید."),
  city: z.string().trim().min(2, "شهر را وارد کنید."),
  address: z.string().trim().min(10, "نشانی را کامل‌تر وارد کنید."),
  postal_code: z
    .string()
    .trim()
    .regex(/^\d{10}$/, "کد پستی باید ۱۰ رقم باشد."),
});

type Coupon = {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_purchase: number;
};

function CheckoutPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const startPayment = useServerFn(startShopPayment);

  const [form, setForm] = useState({
    full_name: "",
    mobile: "",
    province: "",
    city: "",
    address: "",
    postal_code: "",
  });
  const [note, setNote] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const cartQuery = useQuery({
    queryKey: ["shop-cart"],
    queryFn: () => shopRpc<ShopCartLine[]>("shop_cart_get"),
  });

  const lines = cartQuery.data ?? [];
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const discount = !coupon
    ? 0
    : Math.min(
        subtotal,
        coupon.discount_type === "percent"
          ? Math.floor((subtotal * coupon.discount_value) / 100)
          : coupon.discount_value,
      );
  const total = Math.max(0, subtotal - discount);

  const couponMut = useMutation({
    mutationFn: () => shopRpc<Coupon>("shop_validate_coupon", { p_code: couponCode.trim() }),
    onSuccess: (data) => {
      if (subtotal < data.min_purchase) {
        setCoupon(null);
        toast.error("مبلغ سبد خرید برای استفاده از این کد تخفیف کافی نیست.");
        return;
      }
      setCoupon(data);
      toast.success("کد تخفیف اعمال شد.");
    },
    onError: (e) => {
      setCoupon(null);
      toast.error(humanizeShopError(e));
    },
  });

  const submit = async () => {
    const parsed = shippingSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        next[String(issue.path[0])] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const order = await shopRpc<{ order_id: string }>("shop_place_order", {
        p_items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        p_shipping: parsed.data,
        p_coupon_code: coupon ? coupon.code : null,
        p_note: note.trim() || null,
      });
      void qc.invalidateQueries({ queryKey: ["shop-cart"] });
      const payment = await startPayment({ data: { orderId: order.order_id } });
      window.location.assign(payment.redirect_url);
    } catch (e) {
      toast.error(humanizeShopError(e));
      setSubmitting(false);
      // سفارش در وضعیت pending می‌ماند و از «سفارش‌های من» قابل پرداخت مجدد است.
      void navigate({ to: "/my-orders" });
    }
  };

  const field = (name: keyof typeof form, label: string, placeholder?: string) => (
    <div className="space-y-1">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        value={form[name]}
        placeholder={placeholder ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [name]: e.target.value }))}
      />
      {errors[name] && <p className="text-xs text-destructive">{errors[name]}</p>}
    </div>
  );

  return (
    <div>
      <PageHeader title="تسویه حساب" description="اطلاعات ارسال را وارد و سفارش را پرداخت کنید" />

      {cartQuery.isLoading ? (
        <LoadingState rows={4} />
      ) : cartQuery.isError ? (
        <ErrorState error={cartQuery.error} onRetry={() => void cartQuery.refetch()} />
      ) : lines.length === 0 ? (
        <EmptyState
          title="سبد خرید خالی است"
          description="برای تسویه حساب ابتدا محصولی به سبد اضافه کنید."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">اطلاعات ارسال</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {field("full_name", "نام و نام خانوادگی")}
              {field("mobile", "شماره موبایل", "09xxxxxxxxx")}
              {field("province", "استان")}
              {field("city", "شهر")}
              <div className="sm:col-span-2">{field("address", "نشانی کامل")}</div>
              {field("postal_code", "کد پستی")}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="note">یادداشت سفارش (اختیاری)</Label>
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">خلاصه سفارش</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                {lines.map((l) => (
                  <div key={l.product_id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {l.title} × {l.quantity}
                    </span>
                    <span>{formatPrice(l.price * l.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <Label htmlFor="coupon">کد تخفیف</Label>
                <div className="flex gap-2">
                  <Input
                    id="coupon"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="مثلاً OFF20"
                  />
                  <Button
                    variant="outline"
                    disabled={!couponCode.trim() || couponMut.isPending}
                    onClick={() => couponMut.mutate()}
                  >
                    {couponMut.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <BadgePercent className="size-4" />
                    )}
                    اعمال
                  </Button>
                </div>
              </div>

              <div className="space-y-1 border-t pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">جمع کل</span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">تخفیف</span>
                  <span>{discount > 0 ? `- ${formatPrice(discount)}` : "—"}</span>
                </div>
                <div className="flex justify-between pt-1 text-base font-bold">
                  <span>مبلغ قابل پرداخت</span>
                  <span className="text-primary">{formatPrice(total)}</span>
                </div>
              </div>

              <Button className="w-full" disabled={submitting} onClick={() => void submit()}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                پرداخت و ثبت سفارش
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                <Link to="/cart" className="hover:text-primary">
                  بازگشت به سبد خرید
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
