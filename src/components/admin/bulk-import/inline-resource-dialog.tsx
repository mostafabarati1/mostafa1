import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { rpc } from "@/lib/supabase-rpc";
import { humanizeError } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type InlineResourceKind = "category" | "subject" | "exam" | "organization";

const LABELS: Record<InlineResourceKind, { title: string; field: string; queryKey: string }> = {
  category: { title: "دسته‌بندی جدید", field: "نام دسته‌بندی", queryKey: "admin-cats-min" },
  subject: { title: "درس جدید", field: "نام درس", queryKey: "admin-subjects-min" },
  exam: { title: "آزمون جدید", field: "عنوان آزمون", queryKey: "admin-exams-min" },
  organization: { title: "سازمان جدید", field: "نام سازمان", queryKey: "admin-orgs-min" },
};

/** ایجاد سریع دسته‌بندی/درس/آزمون بدون خروج از ماژول ورود گروهی */
export async function createInlineResource(
  kind: InlineResourceKind,
  name: string,
): Promise<{ id: string; name: string }> {
  if (kind === "exam") {
    const res = await rpc<{ id: string; title: string }>("create_exam_for_bulk_import", {
      p_title: name,
    });
    return { id: res.id, name: res.title ?? name };
  }
  if (kind === "organization") {
    const id = await rpc<string>("create_organization_for_bulk_import", { p_name: name });
    return { id, name };
  }
  const fn =
    kind === "category" ? "create_category_for_bulk_import" : "create_subject_for_bulk_import";
  const res = await rpc<{ id: string; name: string }>(fn, { p_name: name });
  return { id: res.id, name: res.name ?? name };
}

export function InlineResourceDialog({
  kind,
  onCreated,
  defaultName = "",
  triggerLabel,
}: {
  kind: InlineResourceKind;
  onCreated?: (created: { id: string; name: string }) => void;
  defaultName?: string;
  triggerLabel?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const meta = LABELS[kind];

  const submit = async () => {
    if (!name.trim()) {
      toast.error(`${meta.field} الزامی است`);
      return;
    }
    setBusy(true);
    try {
      const created = await createInlineResource(kind, name.trim());
      await qc.invalidateQueries({ queryKey: [meta.queryKey] });
      toast.success(`${meta.title} ایجاد شد`);
      onCreated?.(created);
      setOpen(false);
      setName("");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setName(defaultName);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="ms-1 size-4" />
          {triggerLabel ?? "ایجاد"}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>{meta.title}</DialogTitle>
          <DialogDescription>
            پس از ایجاد، مورد جدید بلافاصله برای ورود سوال‌ها قابل انتخاب است.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{meta.field}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={meta.field}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            انصراف
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy && <Loader2 className="ms-1 size-4 animate-spin" />}
            ایجاد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
