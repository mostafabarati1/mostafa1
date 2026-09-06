import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowRight, ShoppingBag, ShoppingCart, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/data-states";
import { useAuth } from "@/hooks/use-auth";
import { formatPrice } from "@/lib/format";
import { humanizeShopError } from "@/lib/shop-errors";
import { shopRpc, type ShopProduct } from "@/lib/shop-rpc";
import { getPublicProductSeo } from "@/lib/shop-public.functions";

export const Route = createFileRoute("/shop/$slug")({
  loader: ({ params }) => getPublicProductSeo({ data: { slug: params.slug } }),
  head: ({ params, loaderData }) => {
    const seo = loaderData ?? null;
    const title = seo?.meta_title?.trim() || seo?.title?.trim() || "محصول فروشگاه";
    const fullTitle = `${title} | همراه استخدام`;
    const description =
      seo?.meta_description?.trim() ||
      seo?.summary?.trim() ||
      seo?.description?.trim().slice(0, 155) ||
      "جزئیات و خرید محصول از فروشگاه همراه استخدام.";

    const meta = [
      { title: fullTitle },
      { name: "description", content: description },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:type", content: "product" },
      { property: "og:url", content: `/shop/${params.slug}` },
      { name: "twitter:card", content: "summary" },
    ];

    const scripts = seo
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: seo.title,
              description,
              ...(seo.image ? { image: seo.image } : {}),
              ...(seo.price != null
                ? {
                    offers: {
                      "@type": "Offer",
                      price: seo.price,
                      priceCurrency: seo.currency === "IRT" ? "IRR" : (seo.currency ?? "IRR"),
                      availability: seo.in_stock
                        ? "https://schema.org/InStock"
                        : "https://schema.org/OutOfStock",
                    },
                  }
                : {}),
            }),
          },
        ]
      : [];

    return {
      meta,
      links: [{ rel: "canonical", href: `/shop/${params.slug}` }],
      scripts,
    };
  },
  component: ProductPage,
});


function ProductPage() {
  const { slug } = Route.useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [active, setActive] = useState(0);

  const query = useQuery({
    queryKey: ["shop-product", slug],
    queryFn: () => shopRpc<ShopProduct>("shop_get_product", { p_slug: slug }),
  });

  const addMut = useMutation({
    mutationFn: (productId: string) =>
      shopRpc("shop_cart_add", { p_product_id: productId, p_quantity: 1 }),
    onSuccess: () => {
      toast.success("به سبد خرید افزوده شد.");
      void navigate({ to: "/cart" });
    },
    onError: (e) => toast.error(humanizeShopError(e)),
  });

  const product = query.data;
  const available = product ? product.stock_unlimited || product.stock > 0 : false;
  const images = product?.images ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-background" dir="rtl">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/shop">
            <ArrowRight className="size-4" />
            بازگشت به فروشگاه
          </Link>
        </Button>

        {query.isLoading ? (
          <LoadingState rows={4} />
        ) : query.isError || !product ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-muted">
                {images[active] ? (
                  <img
                    src={images[active]}
                    alt={product.title}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="grid size-full place-items-center text-muted-foreground">
                    <ShoppingBag className="size-10" />
                  </div>
                )}
              </div>
              {images.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {images.map((src, idx) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setActive(idx)}
                      className="size-16 overflow-hidden rounded-lg border"
                      aria-label={`تصویر ${idx + 1}`}
                    >
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{product.title}</h1>
                <Badge variant={available ? "default" : "secondary"}>
                  {available ? "موجود" : "ناموجود"}
                </Badge>
              </div>
              {product.category_name && (
                <p className="text-sm text-muted-foreground">دسته: {product.category_name}</p>
              )}
              {product.summary && <p className="text-muted-foreground">{product.summary}</p>}

              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div>
                    <p className="text-2xl font-extrabold text-primary">
                      {formatPrice(product.price)}
                    </p>
                    {product.compare_at_price && product.compare_at_price > product.price ? (
                      <p className="text-sm text-muted-foreground line-through">
                        {formatPrice(product.compare_at_price)}
                      </p>
                    ) : null}
                  </div>
                  {session ? (
                    <Button
                      disabled={!available || addMut.isPending}
                      onClick={() => addMut.mutate(product.id)}
                    >
                      {addMut.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ShoppingCart className="size-4" />
                      )}
                      افزودن به سبد
                    </Button>
                  ) : (
                    <Button asChild>
                      <Link to="/auth">برای خرید وارد شوید</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>

              {product.description && (
                <div className="whitespace-pre-line rounded-2xl border bg-card p-4 text-sm leading-7">
                  {product.description}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <PublicFooter />
    </div>
  );
}
