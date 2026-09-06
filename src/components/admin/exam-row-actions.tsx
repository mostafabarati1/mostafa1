import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, MoreHorizontal, Pencil, RotateCcw, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ExamInviteLinkButton } from "@/components/admin/exam-invite-link";
import { useDeleteExam, useSetExamStatus, type ExamStatus } from "@/lib/admin/exam-mutations";

export function ExamRowActions({
  examId,
  title,
  status,
  slug,
}: {
  examId: string;
  title: string;
  status: string;
  slug: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const setStatus = useSetExamStatus();
  const remove = useDeleteExam();
  const busy = setStatus.isPending || remove.isPending;

  const change = (next: ExamStatus) => setStatus.mutate({ id: examId, status: next });

  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="sm">
        <Link to="/admin/exams/$id" params={{ id: examId }}>
          <Pencil className="size-4" />
          ویرایش
        </Link>
      </Button>
      <ExamInviteLinkButton slug={slug} title={title} label="دعوت" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`عملیات آزمون ${title}`} disabled={busy}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status !== "published" && (
            <DropdownMenuItem onSelect={() => change("published")}>
              <Send className="size-4" />
              انتشار آزمون
            </DropdownMenuItem>
          )}
          {status !== "draft" && (
            <DropdownMenuItem onSelect={() => change("draft")}>
              <RotateCcw className="size-4" />
              بازگشت به پیش‌نویس
            </DropdownMenuItem>
          )}
          {status !== "archived" && (
            <DropdownMenuItem onSelect={() => change("archived")}>
              <Archive className="size-4" />
              بایگانی آزمون
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" />
            حذف آزمون
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف آزمون «{title}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              با حذف آزمون، سوال‌های اختصاص‌یافته، دروس و نتایج ثبت‌شده‌ی آن نیز از دسترس خارج
              می‌شود. این عملیات قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate(examId)}>حذف کن</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
