import { pgTable, text, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: text("id").primaryKey(),
  versionId: text("version_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  quantityValue: doublePrecision("quantity_value"),
  quantityUnit: text("quantity_unit"),
  emissionFactorId: text("emission_factor_id"),
  emissionSourceType: text("emission_source_type"),
  emissionSourceName: text("emission_source_name"),
  emissionUnitSnapshot: text("emission_unit_snapshot"),
  co2ePerUnitSnapshot: doublePrecision("co2e_per_unit_snapshot"),
  moduleA1A3Share: doublePrecision("module_a1a3_share").notNull().default(1),
  moduleA4Share: doublePrecision("module_a4_share").notNull().default(0),
  moduleA5Share: doublePrecision("module_a5_share").notNull().default(0),
  moduleBShare: doublePrecision("module_b_share").notNull().default(0),
  moduleCShare: doublePrecision("module_c_share").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProductSchema = createInsertSchema(productsTable);
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;
