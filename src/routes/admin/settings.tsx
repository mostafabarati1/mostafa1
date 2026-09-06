import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoadingState, ErrorState, PageHeader } from "@/components/data-states";
import { formatDateTime } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { adminError } from "@/lib/admin/error-messages";
import {
  SECRET_KEY_PATTERN,
  fieldFor,
  toEditableString,
  validateSetting,
  type SettingField,
} from "@/lib/admin/settings-registry";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "تنظیمات | پنل مدیریت همراه استخدام" },
      { name: "description", content: "پیکربندی تنظیمات عمومی سامانه با اعتبارسنجی و ثبت سابقه." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "تنظیمات | پنل مدیریت" },
      { property: "og:description", content: "پیکربندی عمومی سامانه." },
    ],
  }),
  component: SettingsPage,
});

type Setting = { key: string; value: unknown; updated_at: string };

function SettingsPage() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value, updated_at")
        .order("key");
      if (error) throw error;
      return (data ?? []) as unknown as Setting[];
    },
  });

  const saveMut = useMutation({
    mutationFn: (v: { key: string; value: unknown; expected_updated_at: string }) =>
      rpc<{ updated_at: string }>("admin_save_setting", {
        p_key: v.key,
        p_value: v.value,
        p_expected_updated_at: v.expected_updated_at,
        p_reason: "ویرایش تنظیمات از پنل مدیریت",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-settings"] });
      toast.success("تنظیمات ذخیره شد");
    },
    onError: (e) => toast.error(adminError(e)),
  });

  const rows = (query.data ?? []).filter((s) => !SECRET_KEY_PATTERN.test(s.key));
  const hiddenCount = (query.data ?? []).length - rows.length;

  return (
    <div>
      <PageHeader
        title="تنظیمات"
        description="پیکربندی عمومی سامانه — هر تغییر در سابقه فعالیت ثبت می‌شود"
      />

      <Card className="mb-6 border-dashed">
        <CardContent className="flex items-start gap-3 pt-6 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 text-primary" />
          <p>
            کلیدهای محرمانه (کلید API درگاه پرداخت، پیامک و هوش مصنوعی) از این بخش قابل مشاهده یا
            ویرایش نیستند و فقط از صفحات اختصاصی خودشان به‌صورت ماسک‌شده مدیریت می‌شوند.
            {hiddenCount > 0 ? ` (${hiddenCount} کلید محرمانه پنهان شد)` : ""}
          </p>
        </CardContent>
      </Card>

      {query.isLoading ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>تنظیماتی ثبت نشده است</CardTitle>
            <CardDescription>
              تنظیمات کلیدی سامانه از طریق همین بخش قابل مدیریت است.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((s) => (
            <SettingCard
              key={`${s.key}-${s.updated_at}`}
              setting={s}
              saving={saveMut.isPending}
              onSave={(value) =>
                saveMut.mutate({ key: s.key, value, expected_updated_at: s.updated_at })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SettingCard(props: {
  setting: Setting;
  saving: boolean;
  onSave: (value: unknown) => void;
}) {
  const { setting, saving, onSave } = props;
  const field: SettingField = fieldFor(setting.key);
  const [value, setValue] = useState(() => toEditableString(field, setting.value));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const result = validateSetting(field, value);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    onSave(result.value);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{field.label}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {formatDateTime(setting.updated_at)}
          </span>
        </div>
        <CardDescription dir="ltr" className="text-left font-mono text-xs">
          {setting.key}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor={`setting-${setting.key}`}>مقدار</Label>
          {field.kind === "json" ? (
            <Textarea
              id={`setting-${setting.key}`}
              dir="ltr"
              rows={4}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : field.kind === "select" ? (
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger id={`setting-${setting.key}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : field.kind === "boolean" ? (
            <div className="flex items-center gap-2">
              <Switch
                id={`setting-${setting.key}`}
                checked={value === "true"}
                onCheckedChange={(c) => setValue(String(c))}
              />
              <span className="text-sm text-muted-foreground">
                {value === "true" ? "فعال" : "غیرفعال"}
              </span>
            </div>
          ) : (
            <Input
              id={`setting-${setting.key}`}
              dir={
                field.kind === "number" || field.kind === "email" || field.kind === "url"
                  ? "ltr"
                  : undefined
              }
              type={field.kind === "number" ? "number" : "text"}
              {...(field.min != null ? { min: field.min } : {})}
              {...(field.max != null ? { max: field.max } : {})}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
          {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <Button size="sm" disabled={saving} onClick={submit}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : "ذخیره"}
        </Button>
      </CardContent>
    </Card>
  );
}
