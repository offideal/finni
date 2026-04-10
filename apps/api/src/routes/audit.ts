import { Router, type IRouter } from "express";
import { db, projectsTable, versionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuditViewer } from "../middlewares/requireAuth";
import { listAuditEventsForProject, listAuditEventsForVersion } from "../services/auditQueryService";

const router: IRouter = Router({ mergeParams: true });

router.get("/:projectId/versions/:versionId/audit", requireAuditViewer, async (req, res): Promise<void> => {
  const { projectId, versionId } = req.params as { projectId: string; versionId: string };
  const tenantId = req.session.tenantId!;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.tenantId, tenantId)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [version] = await db
    .select()
    .from(versionsTable)
    .where(and(eq(versionsTable.id, versionId), eq(versionsTable.projectId, projectId)));
  if (!version) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const logs = await listAuditEventsForVersion(tenantId, projectId, versionId);
  res.json(logs);
});

router.get("/:projectId/audit", requireAuditViewer, async (req, res): Promise<void> => {
  const { projectId } = req.params as { projectId: string };
  const tenantId = req.session.tenantId!;

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.tenantId, tenantId)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const logs = await listAuditEventsForProject(tenantId, projectId);
  res.json(logs);
});

export default router;
