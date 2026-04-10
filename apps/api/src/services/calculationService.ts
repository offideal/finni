import { db, productsTable, type Product } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getVersionForTenant } from "../access/tenantResources";
import {
  buildVersionCalculationPayload,
  type ProductForCalculation,
  type VersionCalculationPayload,
} from "../domain/calculation";

/**
 * Version CO₂e results are computed on read (no persisted cache table).
 * Same version rows + engine version ⇒ same output; `computedAt` is informational.
 */
export function mapDbProductToCalculationInput(p: Product): ProductForCalculation {
  return {
    id: p.id,
    name: p.name,
    quantityValue: p.quantityValue,
    co2ePerUnitSnapshot: p.co2ePerUnitSnapshot,
    moduleA1A3Share: p.moduleA1A3Share,
    moduleA4Share: p.moduleA4Share,
    moduleA5Share: p.moduleA5Share,
    moduleBShare: p.moduleBShare,
    moduleCShare: p.moduleCShare,
  };
}

export async function computeVersionCalculation(
  tenantId: string,
  versionId: string,
): Promise<VersionCalculationPayload | null> {
  const version = await getVersionForTenant(versionId, tenantId);
  if (!version) return null;

  const rows = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));
  const inputs = rows.map(mapDbProductToCalculationInput);
  return buildVersionCalculationPayload(versionId, inputs, new Date().toISOString());
}
