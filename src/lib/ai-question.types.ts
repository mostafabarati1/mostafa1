/** انواع مشترک بین سرور و کلاینت برای «تولید سوال با هوش مصنوعی». */

export type AiQuestionOption = {
  option_text: string;
  is_correct: boolean;
};

export type AiQuestionGenerated = {
  question_text: string;
  difficulty: "easy" | "medium" | "hard";
  options: AiQuestionOption[];
  explanation: string;
};

export type AiQuestionDraft = {
  id: string;
  status: "draft" | "approved" | "rejected";
  question_text: string;
  difficulty: string | null;
  category_id: string | null;
  subject_id: string | null;
  options: AiQuestionOption[];
  explanation: string | null;
  source_model: string | null;
  created_at: string;
  updated_at: string;
};
