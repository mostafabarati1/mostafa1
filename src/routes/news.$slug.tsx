import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NewsletterPage } from "@/components/newsletter/newsletter-ui";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { formatDate } from "@/lib/format";
import { getPublicNewsBySlug } from "@/lib/newsletter/news-public.functions";

export const Route = createFileRoute("/news/$slug")({
  loader: async ({ params }) => {
    const item = await getPublicNewsBySlug({ data: { slug: params.slug } });
    if (!item) throw notFound();
    return item;
  },
  head: ({ loaderData }) => {
    const title = loaderData?.seo_title ?? loaderData?.title ?? "خبر استخدامی | همراه استخدام";
    const description =
      loaderData?.seo_description ??
      loaderData?.summary ??
      "آخرین اخبار و اطلاعیه‌های آزمون‌های استخدامی در همراه استخدام.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        { property: "og:url", content: `/news/${loaderData?.slug ?? ""}` },
      ],
      links: [{ rel: "canonical", href: `/news/${loaderData?.slug ?? ""}` }],
      scripts: loaderData
        ? [
            {
              type: "application/ld+json",
              children: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "NewsArticle",
                headline: loaderData.title,
                description,
                ...(loaderData.cover_url ? { image: loaderData.cover_url } : {}),
                ...(loaderData.published_at ? { datePublished: loaderData.published_at } : {}),
              }),
            },
          ]
        : [],
    };
  },
  component: NewsDetailPage,
});

function NewsDetailPage() {
  const item = Route.useLoaderData();

  return (
    <NewsletterPage title={item.title}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {item.is_important ? <Badge>مهم</Badge> : null}
        {item.category_name ? <Badge variant="secondary">{item.category_name}</Badge> : null}
        <span>{formatDate(item.published_at)}</span>
      </div>

      {item.summary ? (
        <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.summary}</p>
      ) : null}

      {item.body ? (
        <article className="mt-6 whitespace-pre-line text-sm leading-8 text-foreground">
          {item.body}
        </article>
      ) : null}

      {item.tags.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {item.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to="/news">بازگشت به اخبار</Link>
        </Button>
        {item.source_url ? (
          <Button variant="outline" asChild>
            <a href={item.source_url} target="_blank" rel="noreferrer noopener">
              مشاهده منبع خبر
            </a>
          </Button>
        ) : null}
      </div>

      {/* NEWSLETTER-SIGNUP */}
      <NewsletterSignup source="news_detail" className="mt-10" />
    </NewsletterPage>
  );
}
