import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { computeVersionCalculation } from "../services/calculationService";

const router: IRouter = Router({ mergeParams: true });

router.get("/:versionId/calculations", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };

  const result = await computeVersionCalculation(req.session.tenantId!, versionId);
  if (!result) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  res.json(result);
});

export default router;
