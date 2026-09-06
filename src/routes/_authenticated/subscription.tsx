import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BadgeCheck, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CardsLoading, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatPrice, humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { startZarinpalPayment } from "@/lib/payments.functions";
import type { MySubscription, Plan } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/subscription")({
  head: () => ({
    meta: [
      { title: "اشتراک | همراه استخدام" },
      { name: "description", content: "خرید و مدیریت اشتراک" },
    ],
  }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const startPayment = useServerFn(startZarinpalPayment);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ["plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plans")
        .select("id, title, price, duration_months, is_active, display_order")
        .eq("is_active", true)
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as Plan[];
    },
  });

  const subQuery = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => rpc<MySubscription>("my_subscription"),
  });

  const buy = async (planId: string) => {
    setBuying(planId);
    setError(null);
    try {
      const result = await startPayment({ data: { planId } });
      window.location.assign(result.redirect_url);
    } catch (e) {
      setError(humanizeError(e));
      setBuying(null);
    }
  };

  const sub = subQuery.data;
  const plans = plansQuery.data ?? [];

  return (
    <div>
      <PageHeader
        title="اشتراک"
        description="با فعال‌سازی اشتراک، به همه آزمون‌های سامانه دسترسی نامحدود داشته باشید"
      />

      {sub && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <BadgeCheck className="size-8 text-primary" />
              <div>
                <p className="font-semibold">
                  {sub.has_active ? "اشتراک شما فعال است" : "اشتراک فعال ندارید"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {sub.subscription?.expires_at
                    ? `اعتبار تا ${formatDate(sub.subscription.expires_at)}`
                    : sub.trial_ends_at
                      ? `دوره آزمایشی تا ${formatDate(sub.trial_ends_at)}`
                      : sub.has_active
                        ? "اعتبار نامحدود"
                        : "برای شرکت در آزمون‌های غیررایگان اشتراک بخرید."}
                </p>
              </div>
            </div>
            {sub.has_active && <Badge>فعال</Badge>}
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {plansQuery.isLoading ? (
        <CardsLoading count={3} />
      ) : plansQuery.isError ? (
        <ErrorState error={plansQuery.error} onRetry={() => void plansQuery.refetch()} />
      ) : plans.length === 0 ? (
        <EmptyState title="پلنی تعریف نشده است" description="هیچ پلن فعالی در سامانه وجود ندارد." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="size-4 text-primary" />
                  {plan.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="mt-auto space-y-4">
                <p className="text-3xl font-extrabold text-primary">{formatPrice(plan.price)}</p>
                <p className="text-sm text-muted-foreground">
                  {plan.duration_months >= 12
                    ? `${Math.floor(plan.duration_months / 12)} سال`
                    : `${plan.duration_months} ماهه`}
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    دسترسی نامحدود به آزمون‌ها
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    کارنامه و تحلیل نتایج
                  </li>
                </ul>
                <Button
                  className="w-full"
                  disabled={buying === plan.id}
                  onClick={() => void buy(plan.id)}
                >
                  {buying === plan.id ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      در حال اتصال به درگاه…
                    </>
                  ) : (
                    "خرید اشتراک"
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
