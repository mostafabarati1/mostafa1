import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch, ShoppingBag } from "lucide-react";

import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CardsLoading, EmptyState, ErrorState } from "@/components/data-states";
import { formatPrice } from "@/lib/format";
import { shopRpc, type ShopCategory, type ShopProduct } from "@/lib/shop-rpc";

export const Route = createFileRoute("/shop/")({
  head: () => ({
    meta: [
      { title: "فروشگاه | همراه استخدام" },
      {
        name: "description",
        content: "خرید کتاب، جزوه و پکیج آزمون‌های استخدامی از فروشگاه همراه استخدام.",
      },
      { property: "og:title", content: "فروشگاه همراه استخدام" },
      {
        property: "og:description",
        content: "کتاب، جزوه و پکیج آزمون آزمایشی برای آمادگی آزمون‌های استخدامی.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShopIndexPage,
});

function ShopIndexPage() {
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["shop-categories"],
    queryFn: () => shopRpc<ShopCategory[]>("shop_list_categories"),
  });

  const productsQuery = useQuery({
    queryKey: ["shop-products", search, category],
    queryFn: () =>
      shopRpc<{ items: ShopProduct[]; total: number }>("shop_list_products", {
        p_search: search || null,
        p_category_id: category,
        p_limit: 24,
        p_offset: 0,
      }),
  });

  const products = productsQuery.data?.items ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
            <ShoppingBag className="size-6 text-primary" />
            فروشگاه همراه استخدام
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            کتاب، جزوه و پکیج آزمون‌های آزمایشی برای آمادگی آزمون‌های استخدامی.
          </p>
        </header>

        <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setSearch(term.trim());
            }}
            placeholder="جست‌وجوی محصول…"
            aria-label="جست‌وجوی محصول"
            className="min-w-[12rem] flex-1"
          />
          <Button variant="outline" onClick={() => setSearch(term.trim())}>
            <PackageSearch className="size-4" />
            جست‌وجو
          </Button>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={category === null ? "default" : "outline"}
            onClick={() => setCategory(null)}
          >
            همه
          </Button>
          {(categoriesQuery.data ?? []).map((c) => (
            <Button
              key={c.id}
              size="sm"
              variant={category === c.id ? "default" : "outline"}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>

        {productsQuery.isLoading ? (
          <CardsLoading count={6} />
        ) : productsQuery.isError ? (
          <ErrorState error={productsQuery.error} onRetry={() => void productsQuery.refetch()} />
        ) : products.length === 0 ? (
          <EmptyState title="محصولی یافت نشد" description="به‌زودی محصولات جدید اضافه می‌شوند." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => {
              const available = p.stock_unlimited || p.stock > 0;
              return (
                <Card key={p.id} className="flex flex-col overflow-hidden">
                  <Link to="/shop/$slug" params={{ slug: p.slug }} className="block">
                    <div className="aspect-[4/3] w-full bg-muted">
                      {p.images?.[0] ? (
                        <img
                          src={p.images[0]}
                          alt={p.title}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="grid size-full place-items-center text-muted-foreground">
                          <ShoppingBag className="size-8" />
                        </div>
                      )}
                    </div>
                  </Link>
                  <CardContent className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to="/shop/$slug"
                        params={{ slug: p.slug }}
                        className="font-semibold hover:text-primary"
                      >
                        {p.title}
                      </Link>
                      <Badge variant={available ? "default" : "secondary"}>
                        {available ? "موجود" : "ناموجود"}
                      </Badge>
                    </div>
                    {p.summary && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">{p.summary}</p>
                    )}
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <span className="text-lg font-extrabold text-primary">
                        {formatPrice(p.price)}
                      </span>
                      <Button asChild size="sm">
                        <Link to="/shop/$slug" params={{ slug: p.slug }}>
                          مشاهده
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
