import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { humanizeError } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createInlineResource,
  InlineResourceDialog,
  type InlineResourceKind,
} from "./inline-resource-dialog";

type RowErrorLike = {
  field_name: string | null;
  error_code: string;
  raw_value: string;
};

const GROUPS: { kind: InlineResourceKind; field: string; label: string; queryKey: string }[] = [
  { kind: "category", field: "category", label: "دسته‌بندی‌ها", queryKey: "admin-cats-min" },
  { kind: "subject", field: "subject", label: "درس‌ها", queryKey: "admin-subjects-min" },
  { kind: "organization", field: "organization", label: "سازمان‌ها", queryKey: "admin-orgs-min" },
];

/**
 * موارد یافت‌نشده (درس/دسته‌بندی/سازمان) در فایل را نشان می‌دهد و اجازه می‌دهد
 * تک‌تک یا همه‌ی آن‌ها بدون خروج از ماژول ورود گروهی ایجاد شوند.
 * پس از هر ایجاد، اعتبارسنجی دوباره اجرا می‌شود.
 */
export function MissingResourcesPanel({
  errors,
  onCreated,
}: {
  errors: RowErrorLike[];
  onCreated: () => void | Promise<void>;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const missing = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of GROUPS) map.set(g.field, []);
    for (const e of errors) {
      if (!e.raw_value || !/not_found|NOT_FOUND/.test(e.error_code)) continue;
      const bucket = e.field_name ? map.get(e.field_name) : undefined;
      const value = e.raw_value.trim();
      if (bucket && value && !bucket.includes(value)) bucket.push(value);
    }
    return map;
  }, [errors]);

  const total = GROUPS.reduce((sum, g) => sum + (missing.get(g.field)?.length ?? 0), 0);
  if (total === 0) return null;

  const refresh = async () => {
    for (const g of GROUPS) await qc.invalidateQueries({ queryKey: [g.queryKey] });
    await onCreated();
  };

  const createAll = async () => {
    setBusy(true);
    try {
      for (const g of GROUPS) {
        for (const name of missing.get(g.field) ?? []) {
          await createInlineResource(g.kind, name);
        }
      }
      toast.success("موارد یافت‌نشده ایجاد شدند؛ اعتبارسنجی دوباره انجام می‌شود.");
      await refresh();
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>موارد یافت‌نشده در فایل</CardTitle>
          <CardDescription>
            این درس‌ها، دسته‌بندی‌ها و سازمان‌ها در سیستم وجود ندارند. می‌توانید همین‌جا ایجاد کنید.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => void createAll()} disabled={busy}>
          {busy ? (
            <Loader2 className="ms-1 size-4 animate-spin" />
          ) : (
            <Wand2 className="ms-1 size-4" />
          )}
          ایجاد همه و اعتبارسنجی مجدد
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {GROUPS.map((g) => {
          const items = missing.get(g.field) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={g.field} className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">{g.label}:</span>
              {items.map((name) => (
                <span key={name} className="flex items-center gap-1">
                  <Badge variant="secondary">{name}</Badge>
                  <InlineResourceDialog
                    kind={g.kind}
                    defaultName={name}
                    triggerLabel="ایجاد"
                    onCreated={() => void refresh()}
                  />
                </span>
              ))}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
