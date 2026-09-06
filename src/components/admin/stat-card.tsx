import type { ReactNode } from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  delta,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  /** percent change vs previous period */
  delta?: number | null;
}) {
  const dir = delta == null ? null : delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
  const DeltaIcon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start gap-3 p-5">
        {icon && (
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-bold text-foreground">{value}</p>
          <div className="mt-1 flex items-center gap-2">
            {dir && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  dir === "up" && "text-emerald-600 dark:text-emerald-400",
                  dir === "down" && "text-destructive",
                  dir === "flat" && "text-muted-foreground",
                )}
              >
                <DeltaIcon className="size-3.5" />
                {formatNumber(Math.abs(delta ?? 0), 1)}٪
              </span>
            )}
            {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
