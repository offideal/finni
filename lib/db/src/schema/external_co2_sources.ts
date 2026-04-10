import { boolean, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Registry of supported external CO₂ data integrations (version-controlled in app + DB row for enable/disable).
 * Sync logic lives in code; this table controls visibility and admin toggles.
 */
export const externalCo2SourcesTable = pgTable("external_co2_sources", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  displayName: text("display_name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  description: text("description"),
});

export const insertExternalCo2SourceSchema = createInsertSchema(externalCo2SourcesTable);
export type InsertExternalCo2Source = z.infer<typeof insertExternalCo2SourceSchema>;
export type ExternalCo2SourceRow = typeof externalCo2SourcesTable.$inferSelect;
