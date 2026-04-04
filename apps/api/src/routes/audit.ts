import { Router, type IRouter } from "express";
import { db, auditLogsTable, usersTable, projectsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const AUDIT_PAGE_LIMIT = 500;

const router: IRouter = Router({ mergeParams: true });

router.get("/:projectId/audit", requireAuth, async (req, res): Promise<void> => {
  const { projectId } = req.params as { projectId: string };

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.tenantId, req.session.tenantId!)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.tenantId, req.session.tenantId!), eq(auditLogsTable.entityId, projectId)))
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(AUDIT_PAGE_LIMIT);

  const enriched = await Promise.all(
    logs.map(async (log) => {
      const [user] = await db
        .select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, log.userId));
      return { ...log, userName: user?.fullName ?? null };
    }),
  );

  res.json(enriched);
});

export default router;
