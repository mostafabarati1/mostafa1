// Shared payload types mirroring the DB function JSON shapes.

export type PublicExam = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  level: string | null;
  year: number | null;
  period: string | null;
  round: string | null;
  duration_minutes: number | null;
  is_free: boolean;
  price: number | null;
  category_id: string | null;
  organization_id: string | null;
  organization_name: string | null;
  category_name: string | null;
  question_count: number;
  created_at: string;
};

export type CatalogTree = {
  categories: {
    id: string;
    name: string;
    slug: string;
    parent_id: string | null;
    display_order: number;
    exam_count: number;
  }[];
  organizations: { id: string; name: string; slug: string; logo_url: string | null }[];
  subjects: { id: string; name: string; slug: string }[];
  years: number[];
};

export type ExamSubject = {
  id: string;
  subject_id: string;
  name: string;
  coefficient: number | null;
  question_count: number | null;
};

export type ExamDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  keywords: string | null;
  level: string | null;
  status: string;
  access_type: string;
  duration_minutes: number | null;
  max_attempts: number | null;
  passing_score: number | null;
  is_free: boolean;
  price: number | null;
  year: number | null;
  period: string | null;
  round: string | null;
  organization: { id: string; name: string; slug: string; logo_url: string | null } | null;
  category: { id: string; name: string; slug: string } | null;
  subjects: ExamSubject[];
  question_count: number;
};

export type AttemptOption = { id: string; option_text: string; image_url?: string | null };
export type AttemptQuestion = {
  question_id: string;
  question_text: string;
  score: number | null;
  display_order: number | null;
  exam_subject_id: string | null;
  subject_id: string | null;
  subject_name: string | null;
  selected_option_id: string | null;
  options: AttemptOption[];
};

export type AttemptSubject = {
  exam_subject_id: string;
  subject_id: string;
  name: string;
  coefficient: number | null;
  question_count: number | null;
  time_limit_minutes: number | null;
  negative_marking: boolean;
  display_order: number | null;
};

export type PerSubjectScore = {
  subject_id: string | null;
  name: string;
  coefficient: number | null;
  question_count: number;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  earned_score: number;
  total_score: number;
  percentage: number;
};

export type AttemptState = {
  attempt: {
    id: string;
    exam_id: string;
    status: string;
    started_at: string;
    expires_at: string | null;
    submitted_at: string | null;
    category_ids: string[] | null;
  };
  exam: {
    id: string;
    title: string;
    slug: string;
    duration_minutes: number | null;
    passing_score: number | null;
  };
  subjects: AttemptSubject[];
  questions: AttemptQuestion[];
};

export type SubmitResult = {
  attempt_id: string;
  correct_count: number;
  incorrect_count: number;
  unanswered_count: number;
  total_score: number;
  earned_score: number;
  percentage: number;
  passed: boolean;
  per_subject: PerSubjectScore[];
};

export type ReviewQuestion = {
  question_id: string;
  question_text: string;
  score: number | null;
  score_awarded: number | null;
  exam_subject_id: string | null;
  subject_id: string | null;
  subject_name: string | null;
  selected_option_id: string | null;
  is_correct: boolean | null;
  explanation: string | null;
  options: { id: string; option_text: string; is_correct: boolean; image_url?: string | null }[];
};

export type AttemptReview = {
  attempt: {
    id: string;
    status: string;
    submitted_at: string | null;
    correct_count: number | null;
    incorrect_count: number | null;
    unanswered_count: number | null;
    total_score: number | null;
    earned_score: number | null;
    passed: boolean | null;
  };
  exam: { id: string; title: string; slug: string; passing_score: number | null };
  per_subject: PerSubjectScore[];
  questions: ReviewQuestion[];
};

export type MySubscription = {
  has_active: boolean;
  subscription: {
    id: string;
    status: string;
    started_at: string;
    expires_at: string | null;
    plan: {
      id: string;
      title: string;
      price: number | null;
      duration_months: number | null;
    } | null;
  } | null;
  trial_ends_at: string | null;
};

export type Plan = {
  id: string;
  title: string;
  price: number;
  duration_months: number;
  is_active: boolean;
  display_order: number;
};
