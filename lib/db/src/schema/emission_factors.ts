import { boolean, doublePrecision, index, pgTable, text } from "drizzle-orm/pg-core";
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
  },
  (table) => ({
    tenantIdIdx: index("emission_factors_tenant_id_idx").on(table.tenantId),
  }),
);

export const insertEmissionFactorSchema = createInsertSchema(emissionFactorsTable);
export type InsertEmissionFactor = z.infer<typeof insertEmissionFactorSchema>;
export type EmissionFactor = typeof emissionFactorsTable.$inferSelect;
