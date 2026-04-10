import { index, pgTable, text, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** One building snapshot per version (calculation / reporting context). */
export const buildingsTable = pgTable(
  "buildings",
  {
    id: text("id").primaryKey(),
    versionId: text("version_id").notNull().unique(),
    grossAreaM2: doublePrecision("gross_area_m2"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    versionIdIdx: index("buildings_version_id_idx").on(table.versionId),
  }),
);

export const spacesTable = pgTable("spaces", {
  id: text("id").primaryKey(),
  buildingId: text("building_id").notNull(),
  name: text("name").notNull(),
  areaM2: doublePrecision("area_m2").notNull(),
});

export const insertBuildingSchema = createInsertSchema(buildingsTable);
export type InsertBuilding = z.infer<typeof insertBuildingSchema>;
export type Building = typeof buildingsTable.$inferSelect;

export const insertSpaceSchema = createInsertSchema(spacesTable);
export type InsertSpace = z.infer<typeof insertSpaceSchema>;
export type Space = typeof spacesTable.$inferSelect;
