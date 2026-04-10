import { Router, type IRouter } from "express";
import { requireAuth, requireTenantEditor } from "../middlewares/requireAuth";
import { getBuildingForVersionContext, upsertBuildingForVersion } from "../services/buildingService";

const router: IRouter = Router({ mergeParams: true });

/** GET /projects/:projectId/versions/:versionId/building */
router.get("/", requireAuth, async (req, res): Promise<void> => {
  const { projectId, versionId } = req.params as { projectId: string; versionId: string };
  const result = await getBuildingForVersionContext({
    tenantId: req.session.tenantId!,
    projectId,
    versionId,
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  res.json(result.building);
});

/** PUT — tenant editors only; draft version only (locked → 400 via service). */
router.put("/", requireTenantEditor, async (req, res): Promise<void> => {
  const { projectId, versionId } = req.params as { projectId: string; versionId: string };
  const { grossAreaM2, spaces = [] } = req.body as {
    grossAreaM2?: unknown;
    spaces?: Array<{ id?: string; name: string; areaM2: number }>;
  };

  const result = await upsertBuildingForVersion({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    projectId,
    versionId,
    body: {
      grossAreaM2: grossAreaM2 === undefined || grossAreaM2 === null ? null : Number(grossAreaM2),
      spaces: Array.isArray(spaces) ? spaces : [],
    },
  });

  if (!result.ok) {
    res.status(result.status).json({
      error: result.message,
      ...(result.code !== undefined ? { code: result.code } : {}),
    });
    return;
  }

  res.json(result.building);
});

export default router;
