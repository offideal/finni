import { Router, type IRouter } from "express";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { listExternalCo2SourcesForTenant, syncExternalCo2SourceForTenant } from "../services/externalCo2SyncService.ts";

const router: IRouter = Router();

/** List enabled external CO₂ integrations (usage: any authenticated tenant user). */
router.get("/", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.session.tenantId!;
  const list = await listExternalCo2SourcesForTenant(tenantId);
  res.json(list);
});

/** Materialize / refresh catalog rows from the external source (admin-only). */
router.post("/:key/sync", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { key } = req.params as { key: string };
  const tenantId = req.session.tenantId!;
  const userId = req.session.userId!;

  const result = await syncExternalCo2SourceForTenant({
    tenantId,
    sourceKey: key,
    actorUserId: userId,
  });

  if (!result.ok) {
    const status =
      result.code === "NOT_FOUND" ? 404 : result.code === "DISABLED" || result.code === "NO_HANDLER" ? 400 : 500;
    res.status(status).json({ error: result.error, code: result.code });
    return;
  }

  res.json({ upserted: result.upserted, sourceKey: result.sourceKey });
});

export default router;
