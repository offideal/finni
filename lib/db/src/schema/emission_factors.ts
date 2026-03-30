import { pgTable, text, boolean, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const emissionFactorsTable = pgTable("emission_factors", {
  id: text("id").primaryKey(),
  sourceType: text("source_type").notNull().default("generic"),
  sourceName: text("source_name").notNull(),
  category: text("category").notNull(),
  unit: text("unit").notNull(),
  co2ePerUnit: doublePrecision("co2e_per_unit").notNull(),
  active: boolean("active").notNull().default(true),
});

export const insertEmissionFactorSchema = createInsertSchema(emissionFactorsTable);
export type InsertEmissionFactor = z.infer<typeof insertEmissionFactorSchema>;
export type EmissionFactor = typeof emissionFactorsTable.$inferSelect;
