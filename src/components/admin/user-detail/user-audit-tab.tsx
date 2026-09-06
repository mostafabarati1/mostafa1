import { DataTable, type Column } from "@/components/admin/data-table";
import { formatDateTime } from "@/lib/format";
import type { AuditEntry, AdminUserDetail } from "@/lib/admin/queries";
import { JsonDetailDialog } from "@/components/admin/user-detail/json-detail-dialog";
import { AUDIT_ACTION_LABEL, AUDIT_ENTITY_LABEL, labelOf } from "@/lib/admin/user-detail-utils";

export function UserAuditHistoryTab({ detail }: { detail: AdminUserDetail }) {
  const columns: Column<AuditEntry>[] = [
    { key: "created", header: "زمان", cell: (a) => formatDateTime(a.created_at) },
    { key: "actor", header: "عامل", cell: (a) => a.actor_name ?? "سیستم" },
    { key: "action", header: "اقدام", cell: (a) => labelOf(AUDIT_ACTION_LABEL, a.action) },
    { key: "entity", header: "موضوع", cell: (a) => labelOf(AUDIT_ENTITY_LABEL, a.entity) },
    {
      key: "summary",
      header: "خلاصه تغییر",
      cell: (a) => {
        const d = (a.details ?? {}) as Record<string, unknown>;
        const before = d["before"];
        const after = d["after"];
        if (before != null || after != null) {
          return (
            <span className="text-xs text-muted-foreground">
              {String(before ?? "—")} ← {String(after ?? "—")}
            </span>
          );
        }
        const reason = d["reason"];
        return (
          <span className="text-xs text-muted-foreground">
            {typeof reason === "string" && reason ? reason : "—"}
          </span>
        );
      },
    },
    {
      key: "details",
      header: "",
      cell: (a) => <JsonDetailDialog data={a.details ?? {}} title="جزئیات رویداد" />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={detail.audit}
      rowKey={(a) => a.id}
      emptyTitle="فعالیتی ثبت نشده است"
      emptyDescription="تغییری روی این کاربر ثبت نشده است."
    />
  );
}
