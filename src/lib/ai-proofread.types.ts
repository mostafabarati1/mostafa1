/** انواع مشترک بازبینی نگارشی (قابل استفاده در کلاینت و سرور). */
export type ProofreadIssue = {
  field: "question" | "option";
  index: number;
  type: string;
  detail: string;
};

export type ProofreadResult = {
  issues: ProofreadIssue[];
  suggested_question: string;
  suggested_options: string[];
};
