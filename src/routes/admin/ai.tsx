import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/data-states";

export const Route = createFileRoute("/admin/ai")({
  head: () => ({
    meta: [
      { title: "تنظیمات هوش مصنوعی | همراه استخدام" },
      { name: "description", content: "پیکربندی سرویس هوش مصنوعی" },
    ],
  }),
  component: AiSettingsPage,
});

function AiSettingsPage() {
  return (
    <div>
      <PageHeader title="تنظیمات هوش مصنوعی" description="پیکربندی سرویس هوش مصنوعی" />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            مدیریت سرویس هوش مصنوعی
          </CardTitle>
          <CardDescription>
            تنظیمات مدل هوش مصنوعی (ارائه‌دهنده، مدل، کلید API و کش پاسخ‌ها) به‌صورت امن در سمت سرور
            نگهداری می‌شود و از این صفحه در دسترس نیست تا کلیدها در معرض مرورگر قرار نگیرند.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>پیکربندی سرویس هوش مصنوعی از طریق پنل مدیریت (بخش بک‌اند/پایگاه داده) انجام می‌شود.</p>
          <p>تغییرات این تنظیمات بر «توضیح پاسخ سوالات» در صفحه نتیجه آزمون اثر می‌گذارد.</p>
        </CardContent>
      </Card>
    </div>
  );
}
