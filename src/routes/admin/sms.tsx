import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, humanizeError } from "@/lib/format";
import {
  MAX_BULK_RECIPIENTS,
  getAdminSmsSettings,
  listSmsCampaigns,
  saveAdminSmsSettings,
  sendAdminSms,
  type SmsCampaignRow,
  type SmsSendSummary,
} from "@/lib/admin/sms.functions";

export const Route = createFileRoute("/admin/sms")({
  head: () => ({
    meta: [
      { title: "پیامک | پنل مدیریت همراه استخدام" },
      { name: "description", content: "تنظیمات سرویس پیامک، ارسال فردی و گروهی و گزارش کمپین‌ها." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "پیامک | پنل مدیریت" },
      { property: "og:description", content: "تنظیمات، ارسال و گزارش پیامک‌های سامانه." },
    ],
  }),
  component: SmsPage,
});

type LogRow = {
  id: string;
  mobile_masked: string | null;
  purpose: string | null;
  provider_status: number | null;
  success: boolean | null;
  error_message: string | null;
  created_at: string;
};

const PROVIDERS = [
  { value: "kavenegar", label: "کاوه‌نگار" },
  { value: "smsir", label: "sms.ir" },
];

function SmsPage() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getAdminSmsSettings);
  const saveSettings = useServerFn(saveAdminSmsSettings);
  const sendSms = useServerFn(sendAdminSms);
  const fetchCampaigns = useServerFn(listSmsCampaigns);

  const settingsQuery = useQuery({
    queryKey: ["admin-sms-settings"],
    queryFn: () => fetchSettings(),
  });

  const [provider, setProvider] = useState("kavenegar");
  const [enabled, setEnabled] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [senderLine, setSenderLine] = useState("");
  const [verifyTemplate, setVerifyTemplate] = useState("");
  const [welcomeTemplate, setWelcomeTemplate] = useState("");
  const [apiKey, setApiKey] = useState("");

  const settings = settingsQuery.data;

  useEffect(() => {
    if (!settings) return;
    setProvider(settings.provider || "kavenegar");
    setEnabled(settings.enabled);
    setTestMode(settings.test_mode);
    setSenderLine(settings.sender_line ?? "");
    setVerifyTemplate(settings.verify_template_id ?? "");
    setWelcomeTemplate(settings.welcome_template_id ?? "");
    setApiKey("");
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          provider: provider.trim() || "kavenegar",
          enabled,
          test_mode: testMode,
          sender_line: senderLine.trim() || null,
          verify_template_id: verifyTemplate.trim() || null,
          welcome_template_id: welcomeTemplate.trim() || null,
          api_key: apiKey.trim() || null,
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-sms-settings"] });
      void qc.invalidateQueries({ queryKey: ["admin-audit"] });
      setApiKey("");
      toast.success("تنظیمات پیامک ذخیره شد");
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  // ---- Sending ----
  const [audience, setAudience] = useState<"manual" | "active_users">("manual");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [recipientsText, setRecipientsText] = useState("");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<SmsSendSummary | null>(null);

  const recipientList = recipientsText
    .split(/[\s,;،\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);

  const sendMut = useMutation({
    mutationFn: () =>
      sendSms({
        data: {
          message: message.trim(),
          title: campaignTitle.trim() || null,
          audience,
          recipients: audience === "manual" ? recipientList.slice(0, MAX_BULK_RECIPIENTS) : [],
        },
      }),
    onSuccess: (result) => {
      setSummary(result);
      void qc.invalidateQueries({ queryKey: ["admin-sms-logs"] });
      void qc.invalidateQueries({ queryKey: ["admin-sms-campaigns"] });
      toast.success(
        `ارسال انجام شد: ${result.sent} موفق، ${result.failed} ناموفق، ${result.skipped} تکراری`,
      );
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const campaignsQuery = useQuery({
    queryKey: ["admin-sms-campaigns"],
    queryFn: () => fetchCampaigns(),
  });

  const logsQuery = useQuery({
    queryKey: ["admin-sms-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_delivery_logs")
        .select("id,mobile_masked,purpose,provider_status,success,error_message,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const columns: Column<LogRow>[] = [
    {
      key: "mobile",
      header: "گیرنده",
      cell: (r) => (
        <span dir="ltr" className="font-mono text-xs">
          {r.mobile_masked ?? "—"}
        </span>
      ),
    },
    { key: "purpose", header: "نوع", cell: (r) => r.purpose ?? "—" },
    {
      key: "success",
      header: "وضعیت ارسال",
      cell: (r) => (
        <Badge variant={r.success ? "default" : "destructive"}>
          {r.success ? "موفق" : "ناموفق"}
        </Badge>
      ),
    },
    {
      key: "error",
      header: "خطا",
      cell: (r) =>
        r.success === false ? (
          <span dir="ltr" className="text-xs text-destructive">
            {r.error_message ??
              (r.provider_status != null ? `کد ${r.provider_status}` : "خطای نامشخص")}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "created",
      header: "زمان",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
      ),
    },
  ];

  const campaignColumns: Column<SmsCampaignRow>[] = [
    { key: "title", header: "عنوان", cell: (r) => r.title ?? "—" },
    {
      key: "message",
      header: "متن",
      cell: (r) => <span className="line-clamp-1 text-xs">{r.message}</span>,
    },
    {
      key: "audience",
      header: "مخاطبان",
      cell: (r) => (r.audience === "active_users" ? "کاربران فعال" : "دستی"),
    },
    {
      key: "counts",
      header: "نتیجه",
      cell: (r) => (
        <span className="text-xs">
          {r.sent_count} موفق / {r.failed_count} ناموفق / {r.skipped_count} تکراری از{" "}
          {r.total_count}
        </span>
      ),
    },
    {
      key: "mode",
      header: "حالت",
      cell: (r) => (
        <Badge variant={r.test_mode ? "secondary" : "default"}>
          {r.test_mode ? "آزمایشی" : "واقعی"}
        </Badge>
      ),
    },
    {
      key: "created",
      header: "زمان",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</span>
      ),
    },
  ];

  return (
    <div dir="rtl">
      <PageHeader title="پیامک" description="تنظیمات سرویس، ارسال پیامک و گزارش کمپین‌ها" />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">تنظیمات سرویس پیامک</CardTitle>
          <CardDescription>
            کلید سرویس فقط روی سرور نگهداری می‌شود و در این صفحه به‌صورت ماسک‌شده نمایش داده می‌شود.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settingsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری…
            </div>
          ) : settingsQuery.isError ? (
            <div className="space-y-3">
              <p className="text-sm text-destructive">{humanizeError(settingsQuery.error)}</p>
              <Button variant="outline" size="sm" onClick={() => void settingsQuery.refetch()}>
                تلاش دوباره
              </Button>
            </div>
          ) : (
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveMut.mutate();
              }}
            >
              <div className="space-y-2">
                <Label>سرویس‌دهنده</Label>
                <Select value={provider} onValueChange={setProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب سرویس‌دهنده" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sms-api-key">کلید سرویس (API Key)</Label>
                <Input
                  id="sms-api-key"
                  dir="ltr"
                  className="font-mono"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={settings?.api_key_masked ?? "ثبت نشده"}
                />
                <p className="text-xs text-muted-foreground">
                  برای حفظ کلید فعلی این فیلد را خالی بگذارید.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sms-sender">شماره خط ارسال</Label>
                <Input
                  id="sms-sender"
                  dir="ltr"
                  value={senderLine}
                  onChange={(e) => setSenderLine(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sms-verify">شناسه قالب تأیید</Label>
                <Input
                  id="sms-verify"
                  dir="ltr"
                  value={verifyTemplate}
                  onChange={(e) => setVerifyTemplate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sms-welcome">شناسه قالب خوش‌آمد</Label>
                <Input
                  id="sms-welcome"
                  dir="ltr"
                  value={welcomeTemplate}
                  onChange={(e) => setWelcomeTemplate(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="sms-enabled">ارسال پیامک فعال باشد</Label>
                  <p className="text-xs text-muted-foreground">
                    غیرفعال کردن، ارسال را متوقف می‌کند.
                  </p>
                </div>
                <Switch id="sms-enabled" checked={enabled} onCheckedChange={setEnabled} />
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="sms-test">حالت آزمایشی</Label>
                  <p className="text-xs text-muted-foreground">پیامک واقعی ارسال نمی‌شود.</p>
                </div>
                <Switch id="sms-test" checked={testMode} onCheckedChange={setTestMode} />
              </div>

              {!testMode && enabled && !settings?.has_api_key && !apiKey.trim() && (
                <div className="md:col-span-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-6 text-amber-700 dark:text-amber-400">
                  کلید سرویس (API Key) ثبت نشده است؛ تا زمانی که کلید ذخیره نشود، حتی با خاموش‌بودن
                  حالت آزمایشی، پیامک واقعی ارسال نمی‌شود و ارسال‌ها شبیه‌سازی می‌شوند.
                </div>
              )}

              <div className="md:col-span-2 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  {settings?.updated_at
                    ? `آخرین به‌روزرسانی: ${formatDateTime(settings.updated_at)}`
                    : "هنوز تنظیماتی ذخیره نشده است."}
                </span>
                <Button type="submit" disabled={saveMut.isPending}>
                  {saveMut.isPending ? (
                    <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="ms-2 h-4 w-4" />
                  )}
                  ذخیره تنظیمات
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">ارسال پیامک</CardTitle>
          <CardDescription>
            ارسال فردی یا گروهی (حداکثر {MAX_BULK_RECIPIENTS} شماره در هر ارسال). پیامک تکراری با
            همان متن و شماره تا ۳۰ دقیقه دوباره ارسال نمی‌شود.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendMut.mutate();
            }}
          >
            <div className="space-y-2">
              <Label>مخاطبان</Label>
              <Select
                value={audience}
                onValueChange={(v) => setAudience(v as "manual" | "active_users")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">شماره‌های دستی</SelectItem>
                  <SelectItem value="active_users">کاربران فعال</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sms-campaign-title">عنوان کمپین (اختیاری)</Label>
              <Input
                id="sms-campaign-title"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
              />
            </div>

            {audience === "manual" ? (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="sms-recipients">شماره‌ها</Label>
                <Textarea
                  id="sms-recipients"
                  dir="ltr"
                  rows={3}
                  className="font-mono"
                  placeholder="09121234567, 09351234567"
                  value={recipientsText}
                  onChange={(e) => setRecipientsText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {recipientList.length} شماره وارد شده است
                  {recipientList.length > MAX_BULK_RECIPIENTS
                    ? ` (فقط ${MAX_BULK_RECIPIENTS} مورد اول ارسال می‌شود)`
                    : ""}
                </p>
              </div>
            ) : null}

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="sms-message">متن پیامک</Label>
              <Textarea
                id="sms-message"
                rows={4}
                maxLength={600}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{message.trim().length} کاراکتر</p>
            </div>

            <div className="md:col-span-2 flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {testMode || !enabled
                  ? "در حالت آزمایشی پیامک واقعی ارسال نمی‌شود، اما گزارش ثبت می‌گردد."
                  : "ارسال واقعی فعال است."}
              </span>
              <Button
                type="submit"
                disabled={
                  sendMut.isPending ||
                  !message.trim() ||
                  (audience === "manual" && recipientList.length === 0)
                }
              >
                {sendMut.isPending ? (
                  <Loader2 className="ms-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="ms-2 h-4 w-4" />
                )}
                ارسال پیامک
              </Button>
            </div>
          </form>

          {summary ? (
            <div className="mt-4 rounded-lg border p-3 text-sm">
              <p className="font-medium">
                نتیجه ارسال: {summary.sent} موفق، {summary.failed} ناموفق، {summary.skipped} تکراری
                از {summary.total} شماره
              </p>
              {summary.invalid.length > 0 ? (
                <p className="mt-1 text-xs text-destructive">
                  شماره‌های نامعتبر: {summary.invalid.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <h2 className="mb-3 text-base font-semibold">کمپین‌های پیامکی</h2>
      <DataTable
        columns={campaignColumns}
        rows={campaignsQuery.data}
        isLoading={campaignsQuery.isLoading}
        error={campaignsQuery.isError ? campaignsQuery.error : undefined}
        onRetry={() => void campaignsQuery.refetch()}
        rowKey={(r) => r.id}
        emptyTitle="کمپینی ثبت نشده است"
        emptyDescription="پس از نخستین ارسال گروهی، کمپین‌ها اینجا نمایش داده می‌شوند."
      />

      <h2 className="mb-3 mt-6 text-base font-semibold">لاگ ارسال‌ها</h2>
      <DataTable
        columns={columns}
        rows={logsQuery.data}
        isLoading={logsQuery.isLoading}
        error={logsQuery.isError ? logsQuery.error : undefined}
        onRetry={() => void logsQuery.refetch()}
        rowKey={(r) => r.id}
        emptyTitle="سابقه‌ای برای نمایش نیست"
        emptyDescription="تا این لحظه پیامکی ثبت نشده است."
      />
    </div>
  );
}
