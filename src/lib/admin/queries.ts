import { rpc } from "@/lib/supabase-rpc";

export type AdminOverview = {
  range_days: number;
  users: {
    total: number;
    new: number;
    new_prev: number;
    active_7d: number;
    active_7d_prev: number;
  };
  subs: { active: number; trial: number; expired: number; cancelled: number };
  revenue: {
    total: number;
    total_prev: number;
    by_day: { day: string; amount: number }[];
  };
  exams: {
    published: number;
    total: number;
    attempts_today: number;
    attempts_yesterday: number;
    attempt_pass_rate: number;
    attempt_pass_rate_prev: number;
    attempts_by_day: { day: string; count: number }[];
  };
  payments: { total: number; paid: number; failed: number; pending: number };
  question_reports: { open: number; reviewing: number };
  recent_users: {
    id: string;
    full_name: string | null;
    email: string | null;
    created_at: string;
  }[];
  recent_payments: {
    id: string;
    amount: number;
    status: string;
    created_at: string;
    full_name: string | null;
  }[];
  open_reports: { id: string; reason: string; question_id: string; created_at: string }[];
};

export type AuditEntry = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  entity: string;
  entity_id: string | null;
  action: string;
  created_at: string;
  details?: Record<string, unknown> | null;
};

export type AdminUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
  status: string | null;
  created_at: string;
  role: "admin" | "candidate" | null;
  has_active_sub: boolean;
  sub_status: string | null;
  sub_expires_at: string | null;
  plan_title: string | null;
};

export type AdminUsersPage = {
  items: AdminUserRow[];
  total: number;
  page: number;
  page_size: number;
};

export type AdminUserFilters = {
  search?: string;
  role?: "admin" | "candidate" | null;
  status?: string | null;
  hasActiveSub?: boolean | null;
  from?: string | null;
  to?: string | null;
  page: number;
  pageSize: number;
};

export type AdminUserDetail = {
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    mobile: string | null;
    avatar_url: string | null;
    status: string | null;
    has_used_trial: boolean | null;
    trial_started_at: string | null;
    trial_ends_at: string | null;
    created_at: string;
    updated_at: string | null;
    role: "admin" | "candidate" | null;
  };
  /** خلاصه عملیاتی (additive؛ در نسخه‌های قدیمی RPC ممکن است موجود نباشد). */
  summary?: {
    attempts_count: number;
    payments_count: number;
    paid_total: number;
    reports_count: number;
    subscriptions_count: number;
    active_subscription: {
      id: string;
      status: string;
      plan_title: string | null;
      started_at: string | null;
      expires_at: string | null;
    } | null;
    last_activity_at: string | null;
  };
  subscriptions: {
    id: string;
    status: string;
    plan_id: string | null;
    plan_title: string | null;
    started_at: string | null;
    expires_at: string | null;
    created_at: string;
    updated_at?: string | null;
  }[];
  grants: {
    id: string;
    days: number;
    expires_at: string | null;
    reason: string | null;
    created_at: string;
    admin_name: string | null;
  }[];
  attempts: {
    id: string;
    exam_id: string;
    exam_title: string | null;
    status: string;
    earned_score: number | null;
    total_score: number | null;
    passed: boolean | null;
    started_at: string | null;
    submitted_at: string | null;
    correct_count?: number | null;
    incorrect_count?: number | null;
    unanswered_count?: number | null;
    duration_seconds?: number | null;
  }[];
  payments: {
    id: string;
    amount: number;
    status: string;
    gateway: string | null;
    ref_id: string | null;
    plan_title: string | null;
    created_at: string;
    paid_at: string | null;
    currency?: string | null;
    verified_at?: string | null;
    subscription_id?: string | null;
  }[];
  reports: {
    id: string;
    question_id: string;
    reason: string;
    status: string;
    description: string | null;
    created_at: string;
    updated_at?: string | null;
    admin_note?: string | null;
    exam_id?: string | null;
  }[];
  audit: AuditEntry[];
};

export const adminOverviewQuery = (range: number) => ({
  queryKey: ["admin", "overview", range] as const,
  queryFn: () => rpc<AdminOverview>("admin_analytics_overview", { p_range: range }),
  staleTime: 60_000,
});

export const adminRecentAuditQuery = (limit = 8) => ({
  queryKey: ["admin", "recent-audit", limit] as const,
  queryFn: () => rpc<AuditEntry[]>("admin_recent_audit", { p_limit: limit }),
  staleTime: 60_000,
});

export const adminUsersQuery = (f: AdminUserFilters) => ({
  queryKey: ["admin", "users", f] as const,
  queryFn: () =>
    rpc<AdminUsersPage>("admin_list_users", {
      p_search: f.search?.trim() || null,
      p_role: f.role ?? null,
      p_status: f.status ?? null,
      p_has_active_sub: f.hasActiveSub ?? null,
      p_from: f.from ?? null,
      p_to: f.to ?? null,
      p_page: f.page,
      p_page_size: f.pageSize,
    }),
  staleTime: 30_000,
});

export const adminUserDetailQuery = (userId: string) => ({
  queryKey: ["admin", "user", userId] as const,
  queryFn: () => rpc<AdminUserDetail>("admin_get_user_detail", { p_user_id: userId }),
  staleTime: 30_000,
});

export type AdminExamRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  access_type: string;
  level: string | null;
  is_free: boolean;
  price: number;
  duration_minutes: number;
  year: number | null;
  period: string | null;
  round: string | null;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  organization_name: string | null;
  question_count: number;
  attempt_count: number;
};

export type AdminExamsPage = {
  items: AdminExamRow[];
  total: number;
  page: number;
  page_size: number;
};

export type AdminExamFilters = {
  search?: string;
  status?: string | null;
  accessType?: string | null;
  page: number;
  pageSize: number;
};

export const adminExamsQuery = (f: AdminExamFilters) => ({
  queryKey: ["admin", "exams", f] as const,
  queryFn: () =>
    rpc<AdminExamsPage>("admin_list_exams", {
      p_search: f.search?.trim() || null,
      p_status: f.status ?? null,
      p_access_type: f.accessType ?? null,
      p_category_id: null,
      p_page: f.page,
      p_page_size: f.pageSize,
    }),
  staleTime: 30_000,
});

export type AdminExamDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  keywords: string | null;
  meta_title: string | null;
  meta_description: string | null;
  access_type: string;
  category_id: string | null;
  organization_id: string | null;
  level: string | null;
  duration_minutes: number;
  max_attempts: number;
  passing_score: number;
  randomize_questions: boolean;
  randomize_options: boolean;
  show_correct_answers: boolean;
  is_free: boolean;
  price: number;
  status: string;
  year: number | null;
  period: string | null;
  round: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  category_name?: string | null;
  organization_name?: string | null;
  question_count?: number | null;
  attempt_count?: number | null;
  subjects: AdminExamSubject[];
  categories: string[];
  question_ids: string[];
};

export type AdminExamSubject = {
  id: string;
  subject_id: string;
  name: string;
  coefficient: number | null;
  question_count: number | null;
  time_limit_minutes: number | null;
  negative_marking: boolean | null;
  display_order: number | null;
};

export const adminExamDetailQuery = (examId: string) => ({
  queryKey: ["admin", "exam", examId] as const,
  queryFn: () => rpc<AdminExamDetail>("get_exam_admin", { p_exam_id: examId }),
  staleTime: 30_000,
});
