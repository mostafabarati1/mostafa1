import { useState } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function buildInviteUrl(slug: string) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/invite/${slug}`;
}

export function ExamInviteLinkButton({
  slug,
  title,
  variant = "ghost",
  size = "sm",
  label = "لینک دعوت",
}: {
  slug: string;
  title: string;
  variant?: "ghost" | "outline" | "secondary" | "default";
  size?: "sm" | "default";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const url = buildInviteUrl(slug);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("لینک دعوت کپی شد.");
    } catch {
      toast.error("کپی خودکار انجام نشد؛ لینک را دستی انتخاب و کپی کنید.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} aria-label={`لینک دعوت آزمون ${title}`}>
          <Link2 className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>لینک اختصاصی دعوت به آزمون</DialogTitle>
          <DialogDescription>
            این لینک مخصوص آزمون «{title}» است. با اشتراک‌گذاری آن، داوطلب مستقیم به صفحه‌ی معرفی و
            شروع همین آزمون هدایت می‌شود و در صورت نداشتن حساب، بعد از ثبت‌نام به همین آزمون
            برمی‌گردد.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input readOnly value={url} dir="ltr" className="text-left" />
          <Button type="button" variant="secondary" onClick={() => void copy(url)}>
            <Copy className="size-4" />
            کپی
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          نکته: برای آزمون‌های خصوصی یا دعوت‌نامه‌ای، علاوه بر ارسال لینک باید داوطلب را در تب
          «داوطلبان» همان آزمون هم اضافه کنید.
        </p>

        <DialogFooter className="gap-2 sm:justify-start">
          <Button asChild variant="outline">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              مشاهده صفحه دعوت
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void copy(`دعوت به آزمون «${title}» در همراه استخدام:\n${url}`)}
          >
            کپی متن دعوت‌نامه
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
