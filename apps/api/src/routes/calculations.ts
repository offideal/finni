import { Router, type IRouter } from "express";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getVersionForTenant } from "../access/tenantResources";
import { calculateModuleBreakdown } from "../domain/calculation";

const router: IRouter = Router({ mergeParams: true });

router.get("/:versionId/calculations", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };

  const version = await getVersionForTenant(versionId, req.session.tenantId!);
  if (!version) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const products = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));

  const { grandTotal, modules, productsWithLineTotal } = calculateModuleBreakdown(products);

  res.json({
    versionId,
    grandTotal,
    modules,
    products: productsWithLineTotal,
  });
});

export default router;
