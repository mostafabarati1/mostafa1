import { cn } from "@/lib/utils";
import brandMark from "@/assets/brand-mark.png";

type Props = {
  /** icon = only the logomark, full = logomark + tagline */
  variant?: "icon" | "full";
  className?: string;
  /** size of the logomark in px */
  size?: number;
  /** when the logo is purely decorative next to visible brand text */
  decorative?: boolean;
};

function Mark({ size, decorative }: { size: number; decorative: boolean }) {
  return (
    <img
      src={brandMark}
      width={size}
      height={size}
      className="shrink-0 rounded-md object-contain"
      loading="lazy"
      decoding="async"
      {...(decorative ? { alt: "", "aria-hidden": true } : { alt: "همراه استخدام" })}
    />
  );
}

export function BrandLogo({ variant = "full", className, size = 32, decorative }: Props) {
  if (variant === "icon") {
    return (
      <span className={cn("inline-flex", className)}>
        <Mark size={size} decorative={decorative ?? false} />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Mark size={size + 8} decorative />
      <span className="flex flex-col leading-none">
        <span className="text-base font-extrabold tracking-tight text-foreground">
          همراه استخدام
        </span>
        <span className="mt-0.5 text-[10px] font-medium text-muted-foreground">
          آمادگی آزمون‌های استخدامی
        </span>
      </span>
    </span>
  );
}
