import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function PageToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "جست‌وجو…",
  filters,
  actions,
}: {
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3">
      {onSearchChange && (
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pe-9"
            aria-label={searchPlaceholder}
          />
        </div>
      )}
      {filters}
      {actions && <div className="ms-auto flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
