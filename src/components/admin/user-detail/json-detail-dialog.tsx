import { useState } from "react";
import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { maskSensitive } from "@/lib/admin/user-detail-utils";

/** نمایش متادیتای یک رویداد ممیزی؛ مقادیر حساس پیش از نمایش mask می‌شوند. */
export function JsonDetailDialog({
  title = "جزئیات فنی",
  description = "مقادیر حساس مانند توکن، رمز و اطلاعات بانکی نمایش داده نمی‌شوند.",
  data,
  triggerLabel = "جزئیات",
}: {
  title?: string;
  description?: string;
  data: unknown;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const masked = JSON.stringify(maskSensitive(data) ?? {}, null, 2);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Braces className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-80 rounded-xl border bg-muted/30 p-3">
          <pre dir="ltr" className="text-left text-xs whitespace-pre-wrap break-all">
            {masked}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
