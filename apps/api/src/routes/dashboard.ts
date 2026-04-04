import { Router, type IRouter } from "express";
import { db, projectsTable, versionsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/summary", requireAuth, async (req, res): Promise<void> => {
  const tenantId = req.session.tenantId!;

  const [{ totalProjects }] = await db
    .select({ totalProjects: count() })
    .from(projectsTable)
    .where(eq(projectsTable.tenantId, tenantId));

  const [{ draftVersions }] = await db
    .select({ draftVersions: count() })
    .from(versionsTable)
    .innerJoin(projectsTable, eq(versionsTable.projectId, projectsTable.id))
    .where(and(eq(projectsTable.tenantId, tenantId), eq(versionsTable.status, "draft")));

  const [{ lockedVersions }] = await db
    .select({ lockedVersions: count() })
    .from(versionsTable)
    .innerJoin(projectsTable, eq(versionsTable.projectId, projectsTable.id))
    .where(and(eq(projectsTable.tenantId, tenantId), eq(versionsTable.status, "locked")));

  res.json({
    totalProjects: Number(totalProjects),
    draftVersions: Number(draftVersions),
    lockedVersions: Number(lockedVersions),
  });
});

export default router;
