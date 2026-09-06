/** نوع مشترک نتیجه تحلیل گزارش سوال (قابل استفاده در کلاینت و سرور). */
export type TriageResult = {
  category: string;
  severity: "low" | "medium" | "high";
  suggested_status: "pending" | "reviewing" | "resolved" | "rejected";
  summary: string;
  suggested_note: string;
};
