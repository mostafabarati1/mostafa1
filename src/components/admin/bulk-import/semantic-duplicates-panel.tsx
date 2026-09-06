import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { detectSemanticDuplicates } from "@/lib/ai-dedup.functions";
import type { SemanticDuplicateMatch } from "@/lib/ai-dedup.types";
import type { PreparedRow } from "@/lib/admin/bulk-import/validate";

/**
 * پانل تکرار معنایی — کاملاً اختیاری و مکمل جریان اصلی ورود گروهی.
 * در صورت هر خطایی (کلید API، سرویس embeddings یا زیرساخت دیتابیس) به‌جای
 * توقف ورود، فقط برچسب «غیرفعال» نمایش داده می‌شود.
 */
export function SemanticDuplicatesPanel({
  rows,
  onMatches,
}: {
  rows: PreparedRow[];
  onMatches?: (rowNumbers: Set<number>) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [matches, setMatches] = useState<SemanticDuplicateMatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (rows.length === 0) {
      setEnabled(null);
      setMatches([]);
      return;
    }
    setLoading(true);
    const payload = rows.slice(0, 300).map((r) => ({
      row_number: r.row_number,
      question_text: r.question_text,
      options: r.options.map((o) => o.text),
    }));
    detectSemanticDuplicates({ data: { rows: payload } })
      .then((res) => {
        if (cancelled) return;
        setEnabled(res.enabled);
        setMatches(res.matches);
        if (res.enabled) {
          onMatches?.(new Set(res.matches.map((m) => m.row_number)));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setEnabled(false);
        setMatches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  if (rows.length === 0 || enabled === null) return null;

  return (
    <Card className="border-chart-5/40">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-chart-5" />
            تکرار معنایی
          </CardTitle>
          <CardDescription>
            تشخیص سوالات هم‌معنا با متن متفاوت، با استفاده از هوش مصنوعی (اختیاری).
          </CardDescription>
        </div>
        {loading ? (
          <Badge variant="secondary">
            <Loader2 className="ms-1 size-3 animate-spin" />
            در حال بررسی
          </Badge>
        ) : enabled ? (
          <Badge>{matches.length.toLocaleString("fa-IR")} مورد یافت شد</Badge>
        ) : (
          <Badge variant="secondary">غیرفعال</Badge>
        )}
      </CardHeader>
      {enabled && matches.length > 0 && (
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>سطر</TableHead>
                <TableHead>منبع</TableHead>
                <TableHead>متن مشابه</TableHead>
                <TableHead>شباهت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.map((m, i) => (
                <TableRow key={`${m.row_number}-${i}`}>
                  <TableCell>{m.row_number}</TableCell>
                  <TableCell>
                    {m.source === "database" ? (
                      <Badge variant="secondary">بانک سوال</Badge>
                    ) : (
                      <Badge variant="outline">همین فایل — سطر {m.matched_row_number ?? "؟"}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-sm truncate">{m.existing_question_text}</TableCell>
                  <TableCell>{Math.round(m.similarity * 100)}٪</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
      {!enabled && (
        <CardContent>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="size-4" />
            سرویس تشخیص تکرار معنایی در دسترس نیست؛ ورود گروهی مطابق روال عادی ادامه دارد.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
