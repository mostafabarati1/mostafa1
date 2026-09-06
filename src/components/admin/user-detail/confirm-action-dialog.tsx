import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

/**
 * دیالوگ تأیید عملیات مدیریتی؛ در صورت نیاز دلیل مدیر و تعداد روز را می‌گیرد.
 * تا زمانی که پاسخ معتبر سرور نرسد، دکمه تأیید غیرفعال می‌ماند (بدون optimistic).
 */
export function ConfirmActionDialog({
  trigger,
  title,
  description,
  confirmLabel = "تأیید",
  destructive = false,
  pending = false,
  requireReason = false,
  reasonLabel = "دلیل",
  reasonPlaceholder = "دلیل این تغییر را بنویسید",
  withDays = false,
  defaultDays = 30,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  withDays?: boolean;
  defaultDays?: number;
  onConfirm: (input: { reason: string; days: number }) => Promise<unknown> | void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(String(defaultDays));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("");
      setDays(String(defaultDays));
      setSubmitting(false);
    }
  }, [open, defaultDays]);

  const daysValue = Number(days);
  const daysInvalid =
    withDays && (!Number.isFinite(daysValue) || daysValue < 1 || daysValue > 3650);
  const reasonInvalid = requireReason && reason.trim().length < 3;
  const busy = submitting || pending;

  const submit = async () => {
    if (busy || daysInvalid || reasonInvalid) return;
    setSubmitting(true);
    try {
      await onConfirm({ reason: reason.trim(), days: withDays ? daysValue : 0 });
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? null : setOpen(v))}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {withDays && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-days">تعداد روز</Label>
              <Input
                id="confirm-days"
                inputMode="numeric"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                aria-invalid={daysInvalid}
              />
              {daysInvalid && (
                <p className="text-xs text-destructive">عددی بین ۱ تا ۳۶۵۰ وارد کنید.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason">
              {reasonLabel}
              {requireReason ? "" : " (اختیاری)"}
            </Label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              aria-invalid={reasonInvalid}
            />
            {reasonInvalid && (
              <p className="text-xs text-destructive">دلیل باید حداقل ۳ کاراکتر باشد.</p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            انصراف
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={() => void submit()}
            disabled={busy || daysInvalid || reasonInvalid}
          >
            {busy ? "در حال انجام…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
