import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, LoadingState } from "@/components/data-states";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "@/lib/supabase-rpc";
import { adminUsersQuery } from "@/lib/admin/queries";
import { formatDateTime, formatNumber, humanizeError } from "@/lib/format";

type AssignmentRow = {
  candidate_id: string;
  assigned_at: string;
  full_name: string | null;
  email: string | null;
  mobile: string | null;
};

function assignmentsQuery(examId: string) {
  return {
    queryKey: ["admin", "exam", examId, "assignments"] as const,
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data, error } = await supabase
        .from("exam_assignments")
        .select("candidate_id, assigned_at, profiles:candidate_id(full_name, email, mobile)")
        .eq("exam_id", examId)
        .order("assigned_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => {
        const p = row.profiles as {
          full_name: string | null;
          email: string | null;
          mobile: string | null;
        } | null;
        return {
          candidate_id: row.candidate_id,
          assigned_at: row.assigned_at,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          mobile: p?.mobile ?? null,
        };
      });
    },
    staleTime: 30_000,
  };
}

/** تخصیص داوطلبان به آزمون‌های خصوصی یا دعوت‌محور. */
export function ExamCandidatesEditor({ examId }: { examId: string }) {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [search, setSearch] = useState("");

  const assignments = useQuery(assignmentsQuery(examId));
  const assigned = new Set((assignments.data ?? []).map((a) => a.candidate_id));

  const candidates = useQuery({
    ...adminUsersQuery({ search, role: "candidate", page: 1, pageSize: 10 }),
    enabled: search.length > 0,
    placeholderData: keepPreviousData,
  });

  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin", "exam", examId, "assignments"] });

  const assign = useMutation({
    mutationFn: (candidateId: string) =>
      rpc("assign_candidates", { p_exam_id: examId, p_candidate_ids: [candidateId] }),
    onSuccess: () => {
      toast.success("داوطلب به آزمون تخصیص یافت.");
      refresh();
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const unassign = useMutation({
    mutationFn: (candidateId: string) =>
      rpc("unassign_candidate", { p_exam_id: examId, p_candidate_id: candidateId }),
    onSuccess: () => {
      toast.success("دسترسی داوطلب حذف شد.");
      refresh();
    },
    onError: (e) => toast.error(humanizeError(e)),
  });

  const busy = assign.isPending || unassign.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">داوطلبان مجاز</CardTitle>
        <Badge variant="secondary">{formatNumber(assigned.size)} داوطلب</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(term.trim());
          }}
        >
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="جست‌وجوی نام، ایمیل یا موبایل داوطلب…"
            aria-label="جست‌وجوی داوطلب"
          />
          <Button type="submit" variant="secondary">
            <Search className="size-4" />
            جست‌وجو
          </Button>
        </form>

        {search && (
          <div className="space-y-2 rounded-xl border p-3">
            <p className="text-xs font-semibold text-muted-foreground">نتایج جست‌وجو</p>
            {candidates.isLoading ? (
              <LoadingState rows={2} />
            ) : candidates.error ? (
              <ErrorState error={candidates.error} onRetry={() => candidates.refetch()} />
            ) : (candidates.data?.items.length ?? 0) === 0 ? (
              <EmptyState title="داوطلبی یافت نشد" />
            ) : (
              candidates.data?.items.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-3 py-1">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.full_name ?? "بی‌نام"}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {u.email ?? u.mobile ?? "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || assigned.has(u.id)}
                    onClick={() => assign.mutate(u.id)}
                  >
                    <UserPlus className="size-4" />
                    {assigned.has(u.id) ? "تخصیص‌یافته" : "تخصیص"}
                  </Button>
                </div>
              ))
            )}
          </div>
        )}

        {assignments.isLoading ? (
          <LoadingState rows={3} />
        ) : assignments.error ? (
          <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />
        ) : (assignments.data?.length ?? 0) === 0 ? (
          <EmptyState title="هنوز داوطلبی به این آزمون تخصیص نیافته است" />
        ) : (
          <ul className="space-y-2">
            {assignments.data?.map((a) => (
              <li
                key={a.candidate_id}
                className="flex items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{a.full_name ?? "بی‌نام"}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.email ?? a.mobile ?? "—"} · {formatDateTime(a.assigned_at)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => unassign.mutate(a.candidate_id)}
                >
                  <Trash2 className="size-4" />
                  حذف
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
