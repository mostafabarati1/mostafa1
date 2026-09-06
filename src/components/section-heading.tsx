import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  title,
  description,
  align = "start",
  className,
  actions,
  as: Tag = "h2",
}: {
  title: string;
  description?: string;
  align?: "start" | "center";
  className?: string;
  actions?: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-end justify-between gap-3",
        align === "center" && "flex-col items-center text-center",
        className,
      )}
    >
      <div className={cn("min-w-0", align === "center" && "max-w-2xl")}>
        <Tag className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</Tag>
        {description && (
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>
        )}
      </div>
      {actions}
    </div>
  );
}
