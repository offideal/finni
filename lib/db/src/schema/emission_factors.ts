import { boolean, doublePrecision, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** tenant_id null = platform catalog; non-null = tenant-scoped row (e.g. future EPD uploads). */
export const emissionFactorsTable = pgTable(
  "emission_factors",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id"),
    sourceType: text("source_type").notNull().default("generic"),
    sourceName: text("source_name").notNull(),
    category: text("category").notNull(),
    unit: text("unit").notNull(),
    co2ePerUnit: doublePrecision("co2e_per_unit").notNull(),
    active: boolean("active").notNull().default(true),
    /** Set when this row was materialized from an external integration (stable id pair). */
    externalSourceKey: text("external_source_key"),
    externalRecordId: text("external_record_id"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (table) => ({
    tenantIdIdx: index("emission_factors_tenant_id_idx").on(table.tenantId),
    externalLineageIdx: index("emission_factors_external_lineage_idx").on(
      table.tenantId,
      table.externalSourceKey,
      table.externalRecordId,
    ),
  }),
);

export const insertEmissionFactorSchema = createInsertSchema(emissionFactorsTable);
export type InsertEmissionFactor = z.infer<typeof insertEmissionFactorSchema>;
export type EmissionFactor = typeof emissionFactorsTable.$inferSelect;
