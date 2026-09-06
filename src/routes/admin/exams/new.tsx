import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/data-states";
import { ExamForm } from "@/components/admin/exam-form";

export const Route = createFileRoute("/admin/exams/new")({
  head: () => ({
    meta: [
      { title: "ایجاد آزمون جدید | همراه استخدام" },
      { name: "description", content: "ساخت آزمون تازه و تنظیم عنوان، دسترسی و تنظیمات پایه." },
      { property: "og:title", content: "ایجاد آزمون جدید | همراه استخدام" },
      { property: "og:description", content: "ساخت آزمون تازه در پنل مدیریت." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NewExamPage,
});

function NewExamPage() {
  return (
    <>
      <PageHeader
        title="آزمون جدید"
        description="عنوان، توضیح، دسترسی و تنظیمات پایه را وارد کنید"
      />
      <ExamForm />
    </>
  );
}
