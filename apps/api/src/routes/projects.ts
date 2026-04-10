import { Router, type IRouter } from "express";
import { requireAuth, requireTenantEditor } from "../middlewares/requireAuth";
import { getProjectForTenant } from "../access/tenantResources";
import { parsePaginationQuery } from "../http/pagination";
import {
  listProjectsPaginated,
  createProjectWithInitialVersion,
  getDashboardSummaryForTenant,
  updateProjectMetadata,
  archiveProjectForTenant,
  unarchiveProjectForTenant,
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
  const trimmed = String(name).trim();
  if (!trimmed) {
    res.status(400).json({ error: "Project name is required" });
    return;
  }

  const project = await createProjectWithInitialVersion({
    tenantId: req.session.tenantId!,
    userId: req.session.userId!,
    name: trimmed,
    locationCountry: locationCountry ?? "FI",
    buildingType,
  });

  res.status(201).json(project);
});

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const body = await getDashboardSummaryForTenant(req.session.tenantId!);
  res.json(body);
});

router.post("/:id/archive", requireTenantEditor, async (req, res): Promise<void> => {
  const result = await archiveProjectForTenant({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    projectId: req.params["id"]!,
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  res.json(result.project);
});

router.post("/:id/unarchive", requireTenantEditor, async (req, res): Promise<void> => {
  const result = await unarchiveProjectForTenant({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    projectId: req.params["id"]!,
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  res.json(result.project);
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
  const result = await updateProjectMetadata({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    projectId: req.params["id"]!,
    name,
    locationCountry,
    buildingType,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }
  res.json(result.project);
});

export { router as projectsRouter };
export default router;
