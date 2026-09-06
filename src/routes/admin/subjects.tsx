import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState, EmptyState, ErrorState, PageHeader } from "@/components/data-states";
import { humanizeError } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";

export const Route = createFileRoute("/admin/subjects")({
  head: () => ({
    meta: [
      { title: "دروس | همراه استخدام" },
      { name: "description", content: "مدیریت دروس آزمون‌ها" },
    ],
  }),
  component: SubjectsPage,
});

type Row = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  display_order: number;
  status: string;
};

function SubjectsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const query = useQuery({
    queryKey: ["admin-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("id, name, slug, description, display_order, status")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const saveMut = useMutation({
    mutationFn: (v: {
      id: string | null;
      name: string;
      slug: string;
      description: string;
      display_order: number;
      status: string;
    }) =>
      rpc("save_subject", {
        p_id: v.id,
        p_name: v.name,
        p_slug: v.slug,
        p_description: v.description || null,
        p_display_order: v.display_order,
        p_status: v.status,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-subjects"] });
      setOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => rpc("delete_subject", { p_id: id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-subjects"] });
      setDeleting(null);
    },
  });

  const rows = query.data ?? [];
  return (
    <div>
      <PageHeader
        title="دروس"
        description="مدیریت دروس و ضرایب آزمون‌ها"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            درس جدید
          </Button>
        }
      />
      {query.isLoading ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="درسی ثبت نشده است" description="اولین درس را ایجاد کنید." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>اسلاگ</TableHead>
                <TableHead>ترتیب</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="w-32">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell dir="ltr" className="text-xs text-muted-foreground">
                    {r.slug}
                  </TableCell>
                  <TableCell>{r.display_order}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "active" ? "default" : "secondary"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setEditing(r);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleting(r)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SubjectDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        error={saveMut.isError ? humanizeError(saveMut.error) : null}
        saving={saveMut.isPending}
        onSave={(v) => saveMut.mutate(v)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف درس</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف «{deleting?.name}» مطمئن هستید؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              {deleteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SubjectDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Row | null;
  error: string | null;
  saving: boolean;
  onSave: (v: {
    id: string | null;
    name: string;
    slug: string;
    description: string;
    display_order: number;
    status: string;
  }) => void;
}) {
  const { open, onOpenChange, editing, error, saving, onSave } = props;
  const [name, setName] = useState(editing?.name ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [order, setOrder] = useState(editing?.display_order ?? 0);
  const [status, setStatus] = useState(editing?.status ?? "active");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش درس" : "درس جدید"}</DialogTitle>
          <DialogDescription>اطلاعات درس را وارد کنید.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !slug.trim()) return;
            onSave({
              id: editing?.id ?? null,
              name: name.trim(),
              slug: slug.trim(),
              description: desc,
              display_order: Number(order) || 0,
              status,
            });
          }}
        >
          <div className="space-y-2">
            <Label>نام</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>اسلاگ</Label>
            <Input required dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>توضیحات</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>ترتیب</Label>
              <Input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>وضعیت</Label>
              <SelectWrap
                value={status}
                onChange={setStatus}
                options={[
                  ["active", "فعال"],
                  ["inactive", "غیرفعال"],
                ]}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              انصراف
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : editing ? "ذخیره" : "ایجاد"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SelectWrap({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([val, label]) => (
          <SelectItem key={val} value={val}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
