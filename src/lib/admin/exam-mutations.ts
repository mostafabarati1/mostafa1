import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/supabase-rpc";
import { humanizeError } from "@/lib/format";

export type ExamStatus = "draft" | "published" | "archived";

export const EXAM_STATUS_LABEL: Record<ExamStatus, string> = {
  draft: "پیش‌نویس",
  published: "منتشرشده",
  archived: "بایگانی",
};

const STATUS_TOAST: Record<ExamStatus, string> = {
  draft: "آزمون به پیش‌نویس بازگردانده شد.",
  published: "آزمون منتشر شد.",
  archived: "آزمون بایگانی شد.",
};

async function logAudit(examId: string, action: string) {
  try {
    await rpc("log_audit", {
      _entity: "exams",
      _entity_id: examId,
      _action: action,
      _details: {},
    });
  } catch {
    // ثبت رویداد ممیزی نباید مانع انجام عملیات اصلی شود
  }
}

/** تغییر وضعیت انتشار آزمون (پیش‌نویس / منتشرشده / بایگانی). */
export function useSetExamStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ExamStatus }) => {
      const { error } = await supabase.from("exams").update({ status }).eq("id", id);
      if (error) throw error;
      await logAudit(id, `status_${status}`);
      return { id, status };
    },
    onSuccess: ({ id, status }) => {
      toast.success(STATUS_TOAST[status]);
      void queryClient.invalidateQueries({ queryKey: ["admin", "exams"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "exam", id] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });
}

/** حذف کامل آزمون به همراه وابستگی‌های آن. */
export function useDeleteExam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await rpc("delete_exam", { p_id: id });
      return id;
    },
    onSuccess: () => {
      toast.success("آزمون حذف شد.");
      void queryClient.invalidateQueries({ queryKey: ["admin", "exams"] });
    },
    onError: (e) => toast.error(humanizeError(e)),
  });
}
