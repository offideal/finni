import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportsTable = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id").notNull(),
    type: text("type").notNull(),
    filePath: text("file_path").notNull(),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    versionIdIdx: index("reports_version_id_idx").on(table.versionId),
  }),
);

export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    diffJson: text("diff_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantEntityIdx: index("audit_logs_tenant_entity_idx").on(table.tenantId, table.entityId),
  }),
);

export const insertReportSchema = createInsertSchema(reportsTable);
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;

export const insertAuditLogSchema = createInsertSchema(auditLogsTable);
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
