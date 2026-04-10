import { db, productsTable, buildingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Product, Project, Version } from "@workspace/db";
import { getVersionWithProjectForTenant } from "../access/tenantResources";
import {
  summarizeValidationChecks,
  validateVersionForApproval,
  type ValidationCheck,
  type ValidationSummary,
} from "../domain/validationChecks";

export type ValidationRunResult = {
  versionId: string;
  projectId: string;
  passed: boolean;
  checks: ValidationCheck[];
  summary: ValidationSummary;
};

export async function loadVersionValidationContext(
  tenantId: string,
  versionId: string,
): Promise<{
  version: Version;
  project: Project;
  building: typeof buildingsTable.$inferSelect | null;
  products: Product[];
} | null> {
  const row = await getVersionWithProjectForTenant(versionId, tenantId);
  if (!row) return null;

  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.versionId, versionId));
  const products = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));

  return {
    version: row.version,
    project: row.project,
    building: building ?? null,
    products,
  };
}

/** Rule-based validation for a version (same engine as lock preconditions). */
export async function getVersionValidationSummary(
  tenantId: string,
  versionId: string,
): Promise<ValidationRunResult | null> {
  const ctx = await loadVersionValidationContext(tenantId, versionId);
  if (!ctx) return null;

  const { passed, checks } = validateVersionForApproval({
    version: ctx.version,
    building: ctx.building,
    products: ctx.products,
    project: { id: ctx.project.id, name: ctx.project.name },
  });

  return {
    versionId,
    projectId: ctx.project.id,
    passed,
    checks,
    summary: summarizeValidationChecks(checks),
  };
}
