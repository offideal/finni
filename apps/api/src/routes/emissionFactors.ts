import { Router, type IRouter } from "express";
import { db, emissionFactorsTable } from "@workspace/db";
import { eq, or, and, isNull } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const { category, unit, sourceType } = req.query as Record<string, string | undefined>;
  const tenantId = req.session.tenantId!;

  const scope = or(isNull(emissionFactorsTable.tenantId), eq(emissionFactorsTable.tenantId, tenantId));

  const results = await db
    .select()
    .from(emissionFactorsTable)
    .where(and(eq(emissionFactorsTable.active, true), scope));

  const filtered = results.filter((f) => {
    if (category && f.category !== category) return false;
    if (unit && f.unit !== unit) return false;
    if (sourceType && f.sourceType !== sourceType) return false;
    return true;
  });

  res.json(filtered);
});

export default router;
