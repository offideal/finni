import { Router, type IRouter } from "express";
import { requireAuth, requireTenantEditor } from "../middlewares/requireAuth";
import { getProjectForTenant } from "../access/tenantResources";
import { parsePaginationQuery } from "../http/pagination";
import {
  listProjectsPaginated,
  createProjectWithInitialVersion,
  getDashboardSummaryForTenant,
  updateProjectForTenant,
} from "../services/projectService";

const router: IRouter = Router();

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.session.tenantId!;
  const { limit, offset } = parsePaginationQuery(req.query as Record<string, unknown>);
  const body = await listProjectsPaginated(tenantId, limit, offset);
  res.json(body);
});

router.post("/", requireTenantEditor, async (req, res): Promise<void> => {
  const { name, locationCountry, buildingType } = req.body;
  if (!name || !buildingType) {
    res.status(400).json({ error: "Name and buildingType required" });
    return;
  }

  const project = await createProjectWithInitialVersion({
    tenantId: req.session.tenantId!,
    userId: req.session.userId!,
    name,
    locationCountry: locationCountry ?? "FI",
    buildingType,
  });

  res.status(201).json(project);
});

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const body = await getDashboardSummaryForTenant(req.session.tenantId!);
  res.json(body);
});

router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const project = await getProjectForTenant(req.params["id"]!, req.session.tenantId!);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

router.patch("/:id", requireTenantEditor, async (req, res): Promise<void> => {
  const { name, locationCountry, buildingType } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates["name"] = name;
  if (locationCountry !== undefined) updates["locationCountry"] = locationCountry;
  if (buildingType !== undefined) updates["buildingType"] = buildingType;

  const project = await updateProjectForTenant(req.session.tenantId!, req.params["id"]!, updates);

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

export { router as projectsRouter };
export default router;
