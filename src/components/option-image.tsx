import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** نمایش تصویر یک گزینه با اندازه محدود و امکان بزرگ‌نمایی. */
export function OptionImage({
  url,
  alt = "تصویر گزینه",
  className,
}: {
  url?: string | null | undefined;
  alt?: string | undefined;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  if (!url) return null;

  return (
    <>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
        className={cn(
          "mt-2 max-h-40 w-auto max-w-full cursor-zoom-in rounded-lg border object-contain",
          className,
        )}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <img src={url} alt={alt} className="max-h-[80vh] w-full object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}
