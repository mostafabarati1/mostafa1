import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
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

export const Route = createFileRoute("/admin/categories")({
  head: () => ({
    meta: [
      { title: "دسته‌بندی‌ها | همراه استخدام" },
      { name: "description", content: "مدیریت دسته‌بندی آزمون‌ها" },
    ],
  }),
  component: CategoriesPage,
});

type Row = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  display_order: number;
  status: string;
};

function CategoriesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const query = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, slug, description, parent_id, display_order, status")
        .order("display_order");
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async (vals: {
      id: string | null;
      name: string;
      slug: string;
      description: string;
      parent_id: string;
      display_order: number;
      status: string;
    }) =>
      rpc<string>("save_category", {
        p_id: vals.id,
        p_name: vals.name,
        p_slug: vals.slug,
        p_description: vals.description || null,
        p_parent_id: vals.parent_id || null,
        p_display_order: vals.display_order,
        p_status: vals.status,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-categories"] });
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      setOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => rpc("delete_category", { p_id: id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-categories"] });
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      setDeleting(null);
    },
  });

  const rows = query.data ?? [];
  const saveError = saveMut.isError ? humanizeError(saveMut.error) : null;

  return (
    <div>
      <PageHeader
        title="دسته‌بندی‌ها"
        description="مدیریت دسته‌بندی آزمون‌ها"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            دسته‌بندی جدید
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingState rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="دسته‌بندی‌ای وجود ندارد" description="اولین دسته‌بندی را ایجاد کنید." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>اسلاگ</TableHead>
                <TableHead>والد</TableHead>
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
                  <TableCell className="text-muted-foreground">
                    {rows.find((p) => p.id === r.parent_id)?.name ?? "—"}
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

      <CategoryDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        categories={rows.filter((r) => r.id !== editing?.id)}
        error={saveError}
        saving={saveMut.isPending}
        onSave={(v) => saveMut.mutate(v)}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف دسته‌بندی</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف «{deleting?.name}» مطمئن هستید؟ این عملیات قابل بازگشت نیست.
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

      {!user?.id && null}
    </div>
  );
}

function CategoryDialog(props: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Row | null;
  categories: Row[];
  error: string | null;
  saving: boolean;
  onSave: (v: {
    id: string | null;
    name: string;
    slug: string;
    description: string;
    parent_id: string;
    display_order: number;
    status: string;
  }) => void;
}) {
  const { open, onOpenChange, editing, categories, error, saving, onSave } = props;
  const [name, setName] = useState(editing?.name ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [desc, setDesc] = useState(editing?.description ?? "");
  const [parent, setParent] = useState(editing?.parent_id ?? "");
  const [order, setOrder] = useState(editing?.display_order ?? 0);
  const [status, setStatus] = useState(editing?.status ?? "active");

  // Reset when the dialog opens for a new target.
  const key = editing?.id ?? "new";
  void key;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    onSave({
      id: editing?.id ?? null,
      name: name.trim(),
      slug: slug.trim(),
      description: desc,
      parent_id: parent,
      display_order: Number(order) || 0,
      status,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"}</DialogTitle>
          <DialogDescription>
            اطلاعات دسته‌بندی را وارد کنید. اسلاگ باید یکتا و به‌صورت انگلیسی باشد.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
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
              <Label>دسته والد</Label>
              <Select value={parent} onValueChange={setParent}>
                <SelectTrigger>
                  <SelectValue placeholder="بدون والد" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">بدون والد</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>ترتیب</Label>
              <Input
                type="number"
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>وضعیت</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">فعال</SelectItem>
                <SelectItem value="inactive">غیرفعال</SelectItem>
              </SelectContent>
            </Select>
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
