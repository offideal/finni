import { Router, type IRouter } from "express";
import { db, productsTable, buildingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getVersionWithProjectForTenant } from "../access/tenantResources";
import { validateVersionForApproval } from "../domain/validationChecks";

const router: IRouter = Router({ mergeParams: true });

router.get("/:versionId/validation", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };

  const row = await getVersionWithProjectForTenant(versionId, req.session.tenantId!);
  if (!row) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const { version, project } = row;
  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.projectId, project.id));
  const products = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));

  const { passed, checks } = validateVersionForApproval({
    version,
    building: building ?? null,
    products,
  });

  res.json({ versionId, passed, checks });
});

export default router;
