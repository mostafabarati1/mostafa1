/** انواع مشترک بین سرور و کلاینت برای «تحلیل گزینه‌ها». */

export type DistractorQuality = "strong" | "weak" | "obviously_wrong" | "too_close";

export type DistractorAnalysisItem = {
  option_index: number;
  quality: DistractorQuality;
  reason: string;
  suggestion: string;
};

export type DistractorQuestionInput = {
  question_id: string;
  question_text: string;
  difficulty: string | null;
  ai_distractor_report: DistractorAnalysisItem[] | null;
  ai_distractor_reviewed: boolean;
  options: { id: string; option_text: string; is_correct: boolean }[];
};
