import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const versionsTable = pgTable(
  "versions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    versionNumber: integer("version_number").notNull(),
    status: text("status").notNull().default("draft"),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedByUserId: text("locked_by_user_id"),
    notes: text("notes"),
  },
  (table) => ({
    projectIdIdx: index("versions_project_id_idx").on(table.projectId),
  }),
);

export const insertVersionSchema = createInsertSchema(versionsTable);
export type InsertVersion = z.infer<typeof insertVersionSchema>;
export type Version = typeof versionsTable.$inferSelect;
