import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ExamInviteLinkButton } from "@/components/admin/exam-invite-link";
import { adminExamDetailQuery } from "@/lib/admin/queries";
import { PageHeader } from "@/components/data-states";
import { ExamForm } from "@/components/admin/exam-form";
import { ExamQuestionsEditor } from "@/components/admin/exam-questions-editor";
import { ExamCandidatesEditor } from "@/components/admin/exam-candidates-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/admin/exams/$id")({
  head: () => ({
    meta: [
      { title: "ویرایش آزمون | همراه استخدام" },
      { name: "description", content: "ویرایش عنوان، توضیح، نوع دسترسی و تنظیمات برگزاری آزمون." },
      { property: "og:title", content: "ویرایش آزمون | همراه استخدام" },
      { property: "og:description", content: "ویرایش تنظیمات آزمون در پنل مدیریت." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditExamPage,
});

function EditExamPage() {
  const { id } = Route.useParams();
  const detail = useQuery(adminExamDetailQuery(id));
  const exam = detail.data;
  return (
    <>
      <PageHeader
        title="ویرایش آزمون"
        description="به‌روزرسانی تنظیمات، سوال‌ها و داوطلبان مجاز"
        {...(exam
          ? {
              actions: (
                <ExamInviteLinkButton
                  slug={exam.slug}
                  title={exam.title}
                  variant="outline"
                  size="default"
                  label="لینک دعوت به آزمون"
                />
              ),
            }
          : {})}
      />
      <Tabs defaultValue="settings" dir="rtl" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="settings">تنظیمات آزمون</TabsTrigger>
          <TabsTrigger value="questions">سوال‌ها</TabsTrigger>
          <TabsTrigger value="candidates">داوطلبان</TabsTrigger>
        </TabsList>
        <TabsContent value="settings">
          <ExamForm examId={id} />
        </TabsContent>
        <TabsContent value="questions">
          <ExamQuestionsEditor examId={id} />
        </TabsContent>
        <TabsContent value="candidates">
          <ExamCandidatesEditor examId={id} />
        </TabsContent>
      </Tabs>
    </>
  );
}
