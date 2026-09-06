import { createFileRoute } from "@tanstack/react-router";

/**
 * نقطه پایانی cron برای دیجست هفتگی اخبار استخدامی.
 *
 * فقط با همان secret موجود (`NEWSLETTER_CRON_SECRET`) قابل فراخوانی است و از
 * همان سرویس پیامک/هوش مصنوعی/قالب موجود پروژه استفاده می‌کند؛ secret هرگز
 * لاگ یا بازگردانده نمی‌شود.
 */

function isAuthorized(request: Request): boolean {
  const expected = process.env["NEWSLETTER_CRON_SECRET"];
  if (!expected) return false;

  const header = request.headers.get("x-newsletter-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const provided = header ?? bearer ?? "";
  if (provided.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(1, limitParam), 200) : 50;

  const { processWeeklyDigest } = await import("@/lib/ai-digest.server");

  try {
    const summary = await processWeeklyDigest(limit);
    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "digest_failed";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}

export const Route = createFileRoute("/api/public/newsletter-digest/process-queue")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
