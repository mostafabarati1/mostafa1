import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MissingResourcesPanel } from "@/components/admin/bulk-import/missing-resources-panel";
import { SemanticDuplicatesPanel } from "@/components/admin/bulk-import/semantic-duplicates-panel";
import { InlineResourceDialog } from "@/components/admin/bulk-import/inline-resource-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/supabase-rpc";
import { humanizeError } from "@/lib/format";
import { PageHeader } from "@/components/data-states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IMPORT_COLUMNS,
  buildCsvTemplate,
  buildJsonTemplate,
  downloadBlob,
  templateHeaders,
  templateSampleRow,
} from "@/lib/admin/bulk-import/columns";
import { autoMapHeaders, parseImportFile, type ParsedFile } from "@/lib/admin/bulk-import/parse";
import {
  errorsToCsv,
  validateRows,
  type PreparedRow,
  type RowError,
  type ValidationResult,
} from "@/lib/admin/bulk-import/validate";

export const Route = createFileRoute("/admin/bulk-import/")({
  head: () => ({
    meta: [
      { title: "ورود گروهی سوالات | پنل مدیریت" },
      {
        name: "description",
        content: "ورود گروهی سوالات از فایل CSV، Excel و JSON با اعتبارسنجی و گزارش خطا",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "ورود گروهی سوالات" },
      { property: "og:description", content: "ورود دسته‌ای سوالات به بانک سوال" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BulkImportWizard,
});

const STEPS = ["بارگذاری فایل", "نگاشت ستون‌ها", "پیش‌نمایش و اعتبارسنجی", "ورود", "نتیجه"];
const CHUNK_SIZE = 200;
const NONE = "__none__";

type DuplicatePolicy = "skip" | "import_as_new" | "stop_on_duplicate";

type ImportSummary = {
  batchId: string;
  imported: number;
  duplicates: number;
  failed: number;
};

function StepBar({ step }: { step: number }) {
  return (
    <ol className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const state = i < step ? "done" : i === step ? "current" : "todo";
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={
                "flex size-7 items-center justify-center rounded-full border text-xs font-bold " +
                (state === "done"
                  ? "border-primary bg-primary text-primary-foreground"
                  : state === "current"
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground")
              }
            >
              {i + 1}
            </span>
            <span className={state === "todo" ? "text-muted-foreground" : "text-foreground"}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="mx-1 text-muted-foreground">—</span>}
          </li>
        );
      })}
    </ol>
  );
}

function BulkImportWizard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [examId, setExamId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>("skip");
  const [questionStatus, setQuestionStatus] = useState("active");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [serverDuplicates, setServerDuplicates] = useState<Set<number>>(new Set());
  const [semanticDuplicates, setSemanticDuplicates] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const categoriesQ = useQuery({
    queryKey: ["admin-cats-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const subjectsQ = useQuery({
    queryKey: ["admin-subjects-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const organizationsQ = useQuery({
    queryKey: ["admin-orgs-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const examsQ = useQuery({
    queryKey: ["admin-exams-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const validRows = validation?.valid ?? [];
  const errorRows = validation?.errors ?? [];
  const duplicateCount = useMemo(
    () => validRows.filter((r) => serverDuplicates.has(r.row_number)).length,
    [validRows, serverDuplicates],
  );
  const semanticDuplicateCount = useMemo(
    () => validRows.filter((r) => semanticDuplicates.has(r.row_number)).length,
    [validRows, semanticDuplicates],
  );

  const onPickFile = async (file: File) => {
    setBusy(true);
    try {
      const result = await parseImportFile(file);
      setParsed(result);
      setMapping(autoMapHeaders(result.headers));
      setValidation(null);
      setServerDuplicates(new Set());
      setSemanticDuplicates(new Set());
      setSummary(null);
      if (result.truncated) {
        toast.warning("فقط ۵۰۰۰ سطر نخست فایل خوانده شد.");
      }
      setStep(1);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runValidation = async () => {
    if (!parsed) return;
    setBusy(true);
    try {
      const result = validateRows({
        rows: parsed.rows,
        mapping,
        categories: categoriesQ.data ?? [],
        subjects: subjectsQ.data ?? [],
        organizations: organizationsQ.data ?? [],
        defaultCategoryId: categoryId,
        defaultSubjectId: subjectId,
        defaultOrganizationId: organizationId,
      });
      setValidation(result);

      const dupes = new Set<number>();
      if (result.valid.length > 0) {
        const payload = result.valid.map((r) => ({
          row_number: r.row_number,
          question_text: r.question_text,
          options: r.options.map((o) => o.text),
          difficulty: r.difficulty,
          category_id: r.category_id,
        }));
        for (let i = 0; i < payload.length; i += CHUNK_SIZE) {
          const res = await rpc<{ row_number: number; is_duplicate: boolean }[] | null>(
            "admin_validate_question_import",
            { p_rows: payload.slice(i, i + CHUNK_SIZE) },
          );
          for (const item of res ?? []) if (item.is_duplicate) dupes.add(item.row_number);
        }
      }
      setServerDuplicates(dupes);
      setStep(2);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!parsed || validRows.length === 0) return;
    setBusy(true);
    setStep(3);
    setProgress(0);
    try {
      const batchId = await rpc<string>("admin_create_question_import_batch", {
        p_exam_id: examId || null,
        p_file_name: parsed.fileName,
        p_file_type: parsed.fileType,
        p_total_rows: parsed.rows.length,
        p_valid_rows: validRows.length,
        p_invalid_rows: errorRows.length,
      });

      let imported = 0;
      let duplicates = 0;
      let failed = 0;
      const chunks: PreparedRow[][] = [];
      for (let i = 0; i < validRows.length; i += CHUNK_SIZE) {
        chunks.push(validRows.slice(i, i + CHUNK_SIZE));
      }

      for (let i = 0; i < chunks.length; i += 1) {
        const res = await rpc<{ imported: number; duplicates: number; failed: number }>(
          "admin_import_questions",
          {
            p_batch_id: batchId,
            p_exam_id: examId || null,
            p_rows: chunks[i],
            p_chunk_number: i + 1,
            p_is_last_chunk: i === chunks.length - 1,
            p_duplicate_policy: duplicatePolicy,
            p_status: questionStatus,
          },
        );
        imported += Number(res?.imported ?? 0);
        duplicates += Number(res?.duplicates ?? 0);
        failed += Number(res?.failed ?? 0);
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      setSummary({ batchId, imported, duplicates, failed });
      void qc.invalidateQueries({ queryKey: ["admin-questions"] });
      void qc.invalidateQueries({ queryKey: ["admin-exams"] });
      void qc.invalidateQueries({ queryKey: ["admin-import-batches"] });
      toast.success(`${imported} سوال با موفقیت وارد شد`);
      setStep(4);
    } catch (e) {
      toast.error(humanizeError(e));
      setStep(2);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setParsed(null);
    setMapping({});
    setValidation(null);
    setServerDuplicates(new Set());
    setSummary(null);
    setProgress(0);
    setStep(0);
  };

  return (
    <div dir="rtl">
      <PageHeader
        title="ورود گروهی سوالات"
        description="بارگذاری فایل CSV، Excel یا JSON، اعتبارسنجی سطر‌به‌سطر و ورود دسته‌ای به بانک سوال"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/bulk-import/history">
              <History className="ms-1 size-4" />
              تاریخچه ورودها
            </Link>
          </Button>
        }
      />

      <StepBar step={step} />

      {step === 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>۱) بارگذاری فایل</CardTitle>
              <CardDescription>
                حداکثر ۱۰ مگابایت و ۵۰۰۰ سطر. فرمت‌های مجاز: CSV، XLSX و JSON.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/30 p-10 text-center transition-colors hover:border-primary/60"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) void onPickFile(file);
                }}
              >
                {busy ? (
                  <Loader2 className="size-8 animate-spin text-primary" />
                ) : (
                  <Upload className="size-8 text-primary" />
                )}
                <span className="font-medium text-foreground">
                  فایل را اینجا رها کنید یا برای انتخاب کلیک کنید
                </span>
                <span className="text-sm text-muted-foreground">CSV / XLSX / JSON</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onPickFile(file);
                  }}
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>قالب نمونه</CardTitle>
              <CardDescription>ساختار ستون‌های استاندارد را از اینجا دریافت کنید.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  downloadBlob(
                    buildCsvTemplate(),
                    "question-import-template.csv",
                    "text/csv;charset=utf-8",
                  )
                }
              >
                <Download className="ms-1 size-4" />
                دریافت قالب CSV
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  const XLSX = await import("xlsx");
                  const sheet = XLSX.utils.json_to_sheet([templateSampleRow()], {
                    header: templateHeaders(),
                  });
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, sheet, "questions");
                  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
                  downloadBlob(
                    out,
                    "question-import-template.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                  );
                }}
              >
                <Download className="ms-1 size-4" />
                دریافت قالب Excel
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() =>
                  downloadBlob(
                    buildJsonTemplate(),
                    "question-import-template.json",
                    "application/json;charset=utf-8",
                  )
                }
              >
                <Download className="ms-1 size-4" />
                دریافت قالب JSON
              </Button>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle>راهنمای ستون‌ها</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ستون</TableHead>
                    <TableHead>عنوان</TableHead>
                    <TableHead>وضعیت</TableHead>
                    <TableHead>توضیح</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {IMPORT_COLUMNS.map((c) => (
                    <TableRow key={c.key}>
                      <TableCell className="font-mono text-xs">{c.key}</TableCell>
                      <TableCell>{c.label}</TableCell>
                      <TableCell>
                        {c.required ? (
                          <Badge>الزامی</Badge>
                        ) : (
                          <Badge variant="secondary">اختیاری</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.hint}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 1 && parsed && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>۲) نگاشت ستون‌ها</CardTitle>
              <CardDescription>
                فایل «{parsed.fileName}» با {parsed.rows.length} سطر خوانده شد. ستون‌های فایل را به
                ستون‌های استاندارد نسبت دهید.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {IMPORT_COLUMNS.map((c) => (
                <div key={c.key} className="space-y-1">
                  <Label className="text-sm">
                    {c.label}
                    {c.required && <span className="text-destructive"> *</span>}
                  </Label>
                  <Select
                    value={mapping[c.key] || NONE}
                    onValueChange={(v) =>
                      setMapping((m) => ({ ...m, [c.key]: v === NONE ? "" : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب ستون" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— بدون نگاشت —</SelectItem>
                      {parsed.headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>تنظیمات مقصد</CardTitle>
              <CardDescription>مقادیر پیش‌فرض برای سطرهایی که مقدار ندارند.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label>آزمون مقصد (اختیاری)</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={examId || NONE}
                    onValueChange={(v) => setExamId(v === NONE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="بدون اتصال به آزمون" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>فقط بانک سوال</SelectItem>
                      {(examsQ.data ?? []).map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <InlineResourceDialog
                    kind="exam"
                    triggerLabel="آزمون جدید"
                    onCreated={(c) => setExamId(c.id)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>دسته‌بندی پیش‌فرض</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={categoryId || NONE}
                    onValueChange={(v) => setCategoryId(v === NONE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب دسته‌بندی" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {(categoriesQ.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <InlineResourceDialog
                    kind="category"
                    triggerLabel="دسته‌بندی جدید"
                    onCreated={(c) => setCategoryId(c.id)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>درس پیش‌فرض</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={subjectId || NONE}
                    onValueChange={(v) => setSubjectId(v === NONE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب درس" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {(subjectsQ.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <InlineResourceDialog
                    kind="subject"
                    triggerLabel="درس جدید"
                    onCreated={(c) => setSubjectId(c.id)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>سازمان پیش‌فرض</Label>
                <div className="flex items-center gap-2">
                  <Select
                    value={organizationId || NONE}
                    onValueChange={(v) => setOrganizationId(v === NONE ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب سازمان" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>—</SelectItem>
                      {(organizationsQ.data ?? []).map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <InlineResourceDialog
                    kind="organization"
                    triggerLabel="سازمان جدید"
                    onCreated={(c) => setOrganizationId(c.id)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>سیاست سوالات تکراری</Label>
                <Select
                  value={duplicatePolicy}
                  onValueChange={(v) => setDuplicatePolicy(v as DuplicatePolicy)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">نادیده گرفتن تکراری‌ها</SelectItem>
                    <SelectItem value="import_as_new">ورود به‌عنوان سوال جدید</SelectItem>
                    <SelectItem value="stop_on_duplicate">توقف در اولین تکراری</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>وضعیت سوالات واردشده</Label>
                <Select value={questionStatus} onValueChange={setQuestionStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">فعال</SelectItem>
                    <SelectItem value="draft">پیش‌نویس</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2 lg:col-span-3">
            <Button variant="outline" onClick={reset}>
              بازگشت
            </Button>
            <Button onClick={() => void runValidation()} disabled={busy}>
              {busy && <Loader2 className="ms-1 size-4 animate-spin" />}
              اعتبارسنجی و پیش‌نمایش
            </Button>
          </div>
        </div>
      )}

      {step === 2 && validation && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-5">
            <SummaryTile label="کل سطرها" value={parsed?.rows.length ?? 0} />
            <SummaryTile label="سطرهای معتبر" value={validRows.length} tone="ok" />
            <SummaryTile label="سطرهای خطادار" value={errorRows.length} tone="error" />
            <SummaryTile label="تکراری در بانک سوال" value={duplicateCount} tone="warn" />
            <SummaryTile label="تکرار معنایی" value={semanticDuplicateCount} tone="warn" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>پیش‌نمایش سطرهای معتبر</CardTitle>
              <CardDescription>۲۰ سطر نخست نمایش داده می‌شود.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <PreviewTable rows={validRows.slice(0, 20)} duplicates={serverDuplicates} />
            </CardContent>
          </Card>

          {errorRows.length > 0 && (
            <MissingResourcesPanel errors={errorRows} onCreated={() => runValidation()} />
          )}

          <SemanticDuplicatesPanel rows={validRows} onMatches={setSemanticDuplicates} />

          {errorRows.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle>خطاهای اعتبارسنجی</CardTitle>
                  <CardDescription>
                    این سطرها وارد نمی‌شوند. پس از اصلاح فایل دوباره بارگذاری کنید.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    downloadBlob(
                      errorsToCsv(errorRows),
                      "import-errors.csv",
                      "text/csv;charset=utf-8",
                    )
                  }
                >
                  <Download className="ms-1 size-4" />
                  دریافت گزارش خطا
                </Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <ErrorTable errors={errorRows.slice(0, 50)} />
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              بازگشت به نگاشت
            </Button>
            <Button onClick={() => void runImport()} disabled={busy || validRows.length === 0}>
              شروع ورود {validRows.length} سوال
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>در حال ورود سوالات…</CardTitle>
            <CardDescription>لطفاً تا پایان عملیات صفحه را نبندید.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">{progress}٪ انجام شد</p>
          </CardContent>
        </Card>
      )}

      {step === 4 && summary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-primary" />
              ورود گروهی به پایان رسید
            </CardTitle>
            <CardDescription>گزارش کامل در تاریخچه ورودها در دسترس است.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryTile label="واردشده" value={summary.imported} tone="ok" />
              <SummaryTile label="تکراری" value={summary.duplicates} tone="warn" />
              <SummaryTile label="ناموفق" value={summary.failed} tone="error" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  void navigate({
                    to: "/admin/bulk-import/$batchId",
                    params: { batchId: summary.batchId },
                  })
                }
              >
                مشاهده گزارش این ورود
              </Button>
              <Button variant="outline" onClick={reset}>
                <FileSpreadsheet className="ms-1 size-4" />
                ورود فایل جدید
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: number;
  tone?: "muted" | "ok" | "warn" | "error";
}) {
  const toneClass =
    tone === "ok"
      ? "text-primary"
      : tone === "warn"
        ? "text-chart-5"
        : tone === "error"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value.toLocaleString("fa-IR")}</p>
    </div>
  );
}

function PreviewTable({ rows, duplicates }: { rows: PreparedRow[]; duplicates: Set<number> }) {
  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <AlertTriangle className="size-4" />
        هیچ سطر معتبری برای ورود وجود ندارد.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>سطر</TableHead>
          <TableHead>متن سوال</TableHead>
          <TableHead>گزینه‌ها</TableHead>
          <TableHead>پاسخ صحیح</TableHead>
          <TableHead>سختی</TableHead>
          <TableHead>نمره</TableHead>
          <TableHead>وضعیت</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.row_number}>
            <TableCell>{r.row_number}</TableCell>
            <TableCell className="max-w-sm truncate">{r.question_text}</TableCell>
            <TableCell>{r.options.length}</TableCell>
            <TableCell className="max-w-40 truncate">
              {r.options
                .filter((o) => o.is_correct)
                .map((o) => o.text)
                .join("، ")}
            </TableCell>
            <TableCell>{r.difficulty}</TableCell>
            <TableCell>{r.score}</TableCell>
            <TableCell>
              {duplicates.has(r.row_number) ? (
                <Badge variant="secondary">تکراری</Badge>
              ) : (
                <Badge>جدید</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ErrorTable({ errors }: { errors: RowError[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>سطر</TableHead>
          <TableHead>ستون</TableHead>
          <TableHead>کد خطا</TableHead>
          <TableHead>پیام</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {errors.map((e, i) => (
          <TableRow key={`${e.row_number}-${i}`}>
            <TableCell>{e.row_number}</TableCell>
            <TableCell className="font-mono text-xs">{e.field_name ?? "—"}</TableCell>
            <TableCell className="font-mono text-xs">{e.error_code}</TableCell>
            <TableCell className="text-sm">{e.error_message}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
