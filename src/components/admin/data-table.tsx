import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingState, ErrorState, EmptyState } from "@/components/data-states";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  isLoading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  rowKey,
  page,
  pageSize,
  total,
  onPageChange,
  toolbar,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  rowKey: (row: T) => string;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  toolbar?: ReactNode;
}) {
  const pageCount =
    page && pageSize && total != null ? Math.max(1, Math.ceil(total / pageSize)) : 1;

  return (
    <div className="space-y-4">
      {toolbar}

      {error ? (
        <ErrorState error={error} {...(onRetry ? { onRetry } : {})} />
      ) : isLoading ? (
        <LoadingState rows={6} />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          title={emptyTitle ?? "موردی یافت نشد"}
          {...(emptyDescription ? { description: emptyDescription } : {})}
        />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c.key} className={cn("text-right", c.className)}>
                    {c.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn("text-right", c.className)}>
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {onPageChange && page && total != null && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            صفحه {formatNumber(page)} از {formatNumber(pageCount)} — مجموع {formatNumber(total)}{" "}
            مورد
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronRight className="size-4" />
              قبلی
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => onPageChange(page + 1)}
            >
              بعدی
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
