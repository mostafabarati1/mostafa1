import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  CircleDollarSign,
  Clock,
  Loader2,
  Receipt,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/data-states";
import { DataTable, type Column } from "@/components/admin/data-table";
import { PageToolbar } from "@/components/admin/page-toolbar";
import { StatCard } from "@/components/admin/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDateTime, formatNumber, formatPrice } from "@/lib/format";
import { rpc } from "@/lib/supabase-rpc";
import { adminError } from "@/lib/admin/error-messages";
import { refundPayment } from "@/lib/admin/payment.functions";

export const Route = createFileRoute("/admin/payments")({
  head: () => ({
    meta: [
      { title: "پرداخت‌ها | پنل مدیریت همراه استخدام" },
      {
        name: "description",
        content: "پیگیری تراکنش‌ها، تأیید دستی پرداخت و ثبت بازپرداخت با ثبت سابقه.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "پرداخت‌ها | پنل مدیریت" },
      { property: "og:description", content: "فهرست، آمار و عملیات مالی تراکنش‌ها." },
    ],
  }),
  component: PaymentsPage,
});

const PAGE_SIZE = 20;

type PaymentRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  amount: number;
  currency: string;
  gateway: string;
  status: string;
  ref_id: string | null;
  plan_title: string | null;
  paid_at: string | null;
  created_at: string;
};

type PayStats = {
  total_count?: number;
  paid_count?: number;
  failed_count?: number;
  pending_count?: number;
  revenue?: number;
};

const STATUS_LABEL: Record<string, string> = {
  paid: "پرداخت‌شده",
  verified: "تأییدشده",
  pending: "در انتظار",
  processing: "در حال پردازش",
  failed: "ناموفق",
  cancelled: "لغوشده",
  refunded: "بازپرداخت‌شده",
};

function maskRef(ref: string | null) {
  if (!ref) return "—";
  return ref.length <= 6 ? ref : `${ref.slice(0, 3)}••••${ref.slice(-3)}`;
}

function PaymentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [verifying, setVerifying] = useState<PaymentRow | null>(null);
  const [refunding, setRefunding] = useState<PaymentRow | null>(null);

  const statsQuery = useQuery({
    queryKey: ["admin-payment-stats"],
    queryFn: () => rpc<PayStats>("admin_payment_stats"),
  });

  const query = useQuery({
    queryKey: ["admin-payments", search, status],
    queryFn: () =>
      rpc<PaymentRow[]>("admin_list_payments", {
        p_search: search || null,
        p_status: status === "all" ? null : status,
        p_limit: 500,
      }),
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const rows = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin-payments"] });
    void qc.invalidateQueries({ queryKey: ["admin-payment-stats"] });
  };

  const s = statsQuery.data ?? {};

  const columns: Column<PaymentRow>[] = [
    {
      key: "user",
      header: "کاربر",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.full_name ?? "—"}</div>
          <div dir="ltr" className="text-xs text-muted-foreground">
            {r.email ?? "—"}
          </div>
        </div>
      ),
    },
    { key: "plan", header: "پلن", cell: (r) => r.plan_title ?? "—" },
    { key: "amount", header: "مبلغ", cell: (r) => formatPrice(r.amount) },
    { key: "gateway", header: "درگاه", cell: (r) => r.gateway },
    {
      key: "status",
      header: "وضعیت",
      cell: (r) => (
        <Badge
          variant={
            ["paid", "verified"].includes(r.status)
              ? "default"
              : ["failed", "cancelled"].includes(r.status)
                ? "destructive"
                : "secondary"
          }
        >
          {STATUS_LABEL[r.status] ?? r.status}
        </Badge>
      ),
    },
    {
      key: "ref",
      header: "کد پیگیری",
      cell: (r) => (
        <span dir="ltr" className="font-mono text-xs text-muted-foreground">
          {maskRef(r.ref_id)}
        </span>
      ),
    },
    {
      key: "date",
      header: "تاریخ",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(r.paid_at ?? r.created_at)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "عملیات",
      className: "w-40",
      cell: (r) => (
        <div className="flex gap-1">
          {!["paid", "verified", "refunded"].includes(r.status) && (
            <Button size="sm" variant="outline" onClick={() => setVerifying(r)}>
              <BadgeCheck className="size-4" />
              تأیید دستی
            </Button>
          )}
          {["paid", "verified"].includes(r.status) && (
            <Button size="sm" variant="outline" onClick={() => setRefunding(r)}>
              <RotateCcw className="size-4" />
              بازپرداخت
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="پرداخت‌ها" description="پیگیری تراکنش‌ها و عملیات مالی کاربران" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="کل پرداخت‌ها"
          value={formatNumber(s.total_count ?? 0)}
          icon={<Receipt className="size-5" />}
        />
        <StatCard
          label="پرداخت موفق"
          value={formatNumber(s.paid_count ?? 0)}
          icon={<BadgeCheck className="size-5" />}
        />
        <StatCard
          label="ناموفق"
          value={formatNumber(s.failed_count ?? 0)}
          icon={<XCircle className="size-5" />}
        />
        <StatCard
          label="در انتظار"
          value={formatNumber(s.pending_count ?? 0)}
          icon={<Clock className="size-5" />}
        />
        <StatCard
          label="درآمد کل"
          value={formatPrice(s.revenue ?? 0)}
          icon={<CircleDollarSign className="size-5" />}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        onRetry={() => void query.refetch()}
        rowKey={(r) => r.id}
        page={page}
        pageSize={PAGE_SIZE}
        total={all.length}
        onPageChange={setPage}
        emptyTitle="تراکنشی یافت نشد"
        emptyDescription="فیلترهای دیگری را امتحان کنید."
        toolbar={
          <PageToolbar
            search={search}
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            searchPlaceholder="جست‌وجوی نام، ایمیل یا کد پیگیری…"
            filters={
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="همه وضعیت‌ها" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                  <SelectItem value="paid">پرداخت‌شده</SelectItem>
                  <SelectItem value="verified">تأییدشده</SelectItem>
                  <SelectItem value="pending">در انتظار</SelectItem>
                  <SelectItem value="processing">در حال پردازش</SelectItem>
                  <SelectItem value="failed">ناموفق</SelectItem>
                  <SelectItem value="cancelled">لغوشده</SelectItem>
                  <SelectItem value="refunded">بازپرداخت‌شده</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        }
      />

      <VerifyDialog payment={verifying} onClose={() => setVerifying(null)} onDone={refresh} />
      <RefundDialog payment={refunding} onClose={() => setRefunding(null)} onDone={refresh} />
    </div>
  );
}

function VerifyDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: PaymentRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  const mut = useMutation({
    mutationFn: (v: { id: string; reference: string; reason: string }) =>
      rpc("admin_manual_verify_payment", {
        p_payment_id: v.id,
        p_reference: v.reference,
        p_reason: v.reason,
      }),
    onSuccess: () => {
      toast.success("پرداخت تأیید شد و اشتراک کاربر فعال گردید");
      onDone();
      onClose();
      setReference("");
      setReason("");
    },
    onError: (e) => toast.error(adminError(e)),
  });

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تأیید دستی پرداخت</DialogTitle>
          <DialogDescription>
            این عملیات وضعیت تراکنش را «تأییدشده» می‌کند و اشتراک کاربر را فعال می‌سازد. فقط زمانی
            استفاده کنید که واریز وجه را در پنل بانک/درگاه تأیید کرده‌اید.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted p-3 text-sm">
            <div>کاربر: {payment?.full_name ?? "—"}</div>
            <div>مبلغ: {payment ? formatPrice(payment.amount) : "—"}</div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="verify-ref">کد پیگیری بانکی</Label>
            <Input
              id="verify-ref"
              dir="ltr"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="verify-reason">دلیل تأیید دستی</Label>
            <Textarea
              id="verify-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button
            disabled={
              !payment || reference.trim().length < 3 || reason.trim().length < 5 || mut.isPending
            }
            onClick={() =>
              payment &&
              mut.mutate({
                id: payment.id,
                reference: reference.trim(),
                reason: reason.trim(),
              })
            }
          >
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : "تأیید پرداخت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  payment,
  onClose,
  onDone,
}: {
  payment: PaymentRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const refund = useServerFn(refundPayment);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const mut = useMutation({
    mutationFn: (v: {
      payment_id: string;
      amount: number;
      reason: string;
      provider_reference: string | null;
    }) => refund({ data: { ...v, idempotency_key: `${v.payment_id}:${idempotencyKey}` } }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success("بازپرداخت ثبت شد");
        onDone();
        onClose();
      } else {
        toast.error(adminError(res.error_code ?? "بازپرداخت ناموفق بود"));
      }
    },
    onError: (e) => toast.error(adminError(e)),
  });

  const max = payment?.amount ?? 0;

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>ثبت بازپرداخت</DialogTitle>
          <DialogDescription>
            بازپرداخت به‌صورت دو مرحله‌ای و با کلید یکتا ثبت می‌شود؛ ارسال مجدد همین درخواست، مبلغ
            را دوباره برنمی‌گرداند. برای درگاه‌های داخلی باید ابتدا وجه را به‌صورت بانکی برگردانید و
            کد پیگیری آن را اینجا ثبت کنید.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted p-3 text-sm">
            <div>کاربر: {payment?.full_name ?? "—"}</div>
            <div>مبلغ تراکنش: {formatPrice(max)}</div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-amount">مبلغ بازپرداخت</Label>
            <Input
              id="refund-amount"
              type="number"
              min={1}
              max={max}
              dir="ltr"
              placeholder={String(max)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-ref">کد پیگیری بازگشت وجه</Label>
            <Input
              id="refund-ref"
              dir="ltr"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="refund-reason">دلیل بازپرداخت</Label>
            <Textarea
              id="refund-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            انصراف
          </Button>
          <Button
            variant="destructive"
            disabled={
              !payment ||
              reason.trim().length < 5 ||
              reference.trim().length < 3 ||
              mut.isPending ||
              (amount.trim() !== "" && (Number(amount) <= 0 || Number(amount) > max))
            }
            onClick={() =>
              payment &&
              mut.mutate({
                payment_id: payment.id,
                amount: amount.trim() === "" ? max : Number(amount),
                reason: reason.trim(),
                provider_reference: reference.trim(),
              })
            }
          >
            {mut.isPending ? <Loader2 className="size-4 animate-spin" /> : "ثبت بازپرداخت"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
