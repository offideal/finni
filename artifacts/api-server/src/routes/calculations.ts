import { Router, type IRouter } from "express";
import { db, versionsTable, projectsTable, productsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router({ mergeParams: true });

router.get("/:versionId/calculations", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };

  const [version] = await db.select().from(versionsTable).where(eq(versionsTable.id, versionId));
  if (!version) { res.status(404).json({ error: "Version not found" }); return; }

  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, version.projectId), eq(projectsTable.tenantId, req.session.tenantId!)));
  if (!project) { res.status(404).json({ error: "Version not found" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));

  const moduleKeys = ["A1-A3", "A4", "A5", "B", "C"] as const;
  const shareField: Record<string, keyof typeof products[0]> = {
    "A1-A3": "moduleA1A3Share",
    "A4": "moduleA4Share",
    "A5": "moduleA5Share",
    "B": "moduleBShare",
    "C": "moduleCShare",
  };

  let grandTotal = 0;
  const modules = moduleKeys.map(module => {
    let co2eTotal = 0;
    const productBreakdown = products.map(p => {
      const productTotal = (p.quantityValue ?? 0) * (p.co2ePerUnitSnapshot ?? 0);
      const share = (p[shareField[module]] as number) ?? 0;
      const contribution = productTotal * share;
      co2eTotal += contribution;
      return { productId: p.id, productName: p.name, co2eContribution: contribution };
    });
    grandTotal += co2eTotal;
    return { module, co2eTotal, productBreakdown };
  });

  const productsWithTotal = products.map(p => ({
    ...p,
    co2eTotal: p.quantityValue != null && p.co2ePerUnitSnapshot != null
      ? p.quantityValue * p.co2ePerUnitSnapshot
      : null,
  }));

  res.json({ versionId, grandTotal, modules, products: productsWithTotal });
});

export default router;
