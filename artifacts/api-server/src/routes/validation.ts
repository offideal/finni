import { Router, type IRouter } from "express";
import { db, versionsTable, projectsTable, productsTable, buildingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router({ mergeParams: true });

router.get("/:versionId/validation", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };

  const [version] = await db.select().from(versionsTable).where(eq(versionsTable.id, versionId));
  if (!version) { res.status(404).json({ error: "Version not found" }); return; }

  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, version.projectId), eq(projectsTable.tenantId, req.session.tenantId!)));
  if (!project) { res.status(404).json({ error: "Version not found" }); return; }

  const checks = [];

  checks.push({ id: "project_exists", passed: true, message: "Project exists", severity: "error" });

  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.projectId, project.id));
  checks.push({
    id: "building_gross_area",
    passed: !!(building && building.grossAreaM2 && building.grossAreaM2 > 0),
    message: "Building gross area is set",
    severity: "error",
  });

  const products = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));

  if (products.length === 0) {
    checks.push({ id: "has_products", passed: false, message: "At least one product is required", severity: "error" });
  } else {
    checks.push({ id: "has_products", passed: true, message: "Version has products", severity: "error" });

    for (const p of products) {
      checks.push({
        id: `product_name_${p.id}`,
        passed: !!(p.name && p.name.trim()),
        message: `Product "${p.name || "(unnamed)"}" has a name`,
        severity: "error",
      });
      checks.push({
        id: `product_category_${p.id}`,
        passed: !!(p.category && p.category.trim()),
        message: `Product "${p.name}" has a category`,
        severity: "error",
      });
      checks.push({
        id: `product_quantity_${p.id}`,
        passed: !!(p.quantityValue && p.quantityValue > 0),
        message: `Product "${p.name}" has quantity value > 0`,
        severity: "error",
      });
      checks.push({
        id: `product_unit_${p.id}`,
        passed: !!(p.quantityUnit),
        message: `Product "${p.name}" has quantity unit`,
        severity: "error",
      });
      checks.push({
        id: `product_factor_${p.id}`,
        passed: !!(p.emissionFactorId && p.co2ePerUnitSnapshot != null),
        message: `Product "${p.name}" has emission factor attached`,
        severity: "error",
      });
      if (p.quantityUnit && p.emissionUnitSnapshot) {
        checks.push({
          id: `product_unit_match_${p.id}`,
          passed: p.quantityUnit === p.emissionUnitSnapshot,
          message: `Product "${p.name}" unit matches emission factor unit`,
          severity: "error",
        });
      }
      const shareSum = (p.moduleA1A3Share ?? 0) + (p.moduleA4Share ?? 0) + (p.moduleA5Share ?? 0) + (p.moduleBShare ?? 0) + (p.moduleCShare ?? 0);
      checks.push({
        id: `product_shares_${p.id}`,
        passed: Math.abs(shareSum - 1.0) < 0.001,
        message: `Product "${p.name}" module shares sum to 1.0 (currently ${shareSum.toFixed(3)})`,
        severity: "error",
      });
    }
  }

  if (version.status === "locked") {
    checks.push({ id: "version_locked", passed: false, message: "Version is locked and cannot be edited", severity: "warning" });
  }

  const passed = checks.filter(c => c.severity === "error").every(c => c.passed);
  res.json({ versionId, passed, checks });
});

export default router;
