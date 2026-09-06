import { createFileRoute, useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, LoadingState, EmptyState } from "@/components/data-states";
import { adminUserDetailQuery } from "@/lib/admin/queries";
import { humanizeError } from "@/lib/format";
import { UserDetailHeader } from "@/components/admin/user-detail/user-detail-header";
import { UserSummaryCards } from "@/components/admin/user-detail/user-summary-cards";
import { UserProfileTab } from "@/components/admin/user-detail/user-profile-tab";
import { UserSubscriptionsTab } from "@/components/admin/user-detail/user-subscriptions-tab";
import { UserAttemptsTab } from "@/components/admin/user-detail/user-attempts-tab";
import { UserPaymentsTab } from "@/components/admin/user-detail/user-payments-tab";
import { UserReportsTab } from "@/components/admin/user-detail/user-reports-tab";
import { UserAuditHistoryTab } from "@/components/admin/user-detail/user-audit-tab";
import {
  UserAccountActions,
  UserSubscriptionActions,
} from "@/components/admin/user-detail/user-admin-actions";

export const Route = createFileRoute("/admin/users/$id")({
  head: () => ({
    meta: [
      { title: "جزئیات کاربر | مدیریت همراه استخدام" },
      { name: "description", content: "پرونده کامل کاربر: اشتراک، پرداخت، آزمون و فعالیت‌ها." },
      { property: "og:title", content: "جزئیات کاربر | مدیریت همراه استخدام" },
      { property: "og:description", content: "پرونده کامل کاربر در پنل مدیریت." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUserDetailPage,
});

function AdminUserDetailPage() {
  const { id } = Route.useParams();
  const { user } = useRouteContext({ from: "/admin" });
  const detail = useQuery(adminUserDetailQuery(id));

  if (detail.isLoading) return <LoadingState rows={6} />;

  if (detail.error) {
    const message = humanizeError(detail.error);
    if (message.includes("یافت نشد")) {
      return (
        <EmptyState
          title="کاربر یافت نشد"
          description="شناسه واردشده معتبر نیست یا این کاربر حذف شده است."
        />
      );
    }
    return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />;
  }

  if (!detail.data) return <EmptyState title="کاربر یافت نشد" />;

  const d = detail.data;
  const p = d.profile;
  const isSelf = user?.id === p.id;

  const accountActions = (
    <UserAccountActions userId={id} role={p.role} status={p.status} isSelf={isSelf} />
  );

  return (
    <div dir="rtl">
      <UserDetailHeader detail={d} actions={accountActions} />
      <UserSummaryCards detail={d} />

      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="profile" dir="rtl">
            <TabsList className="flex-wrap">
              <TabsTrigger value="profile">پروفایل</TabsTrigger>
              <TabsTrigger value="subs">اشتراک‌ها</TabsTrigger>
              <TabsTrigger value="attempts">تلاش‌ها</TabsTrigger>
              <TabsTrigger value="payments">پرداخت‌ها</TabsTrigger>
              <TabsTrigger value="reports">گزارش‌ها</TabsTrigger>
              <TabsTrigger value="audit">تاریخچه تغییرات</TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="pt-4">
              <UserProfileTab detail={d} actions={accountActions} />
            </TabsContent>

            <TabsContent value="subs" className="pt-4">
              <UserSubscriptionsTab detail={d} actions={<UserSubscriptionActions userId={id} />} />
            </TabsContent>

            <TabsContent value="attempts" className="pt-4">
              <UserAttemptsTab detail={d} />
            </TabsContent>

            <TabsContent value="payments" className="pt-4">
              <UserPaymentsTab detail={d} />
            </TabsContent>

            <TabsContent value="reports" className="pt-4">
              <UserReportsTab detail={d} />
            </TabsContent>

            <TabsContent value="audit" className="pt-4">
              <UserAuditHistoryTab detail={d} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
