import { Router, type IRouter } from "express";
import { db, versionsTable, projectsTable, productsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { newId } from "../lib/id";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router({ mergeParams: true });

async function verifyProjectAccess(projectId: string, tenantId: string): Promise<boolean> {
  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.tenantId, tenantId)));
  return !!project;
}

async function enrichVersion(version: typeof versionsTable.$inferSelect) {
  const createdByUser = version.createdByUserId
    ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, version.createdByUserId)).limit(1)
    : [];
  const lockedByUser = version.lockedByUserId
    ? await db.select({ fullName: usersTable.fullName }).from(usersTable).where(eq(usersTable.id, version.lockedByUserId)).limit(1)
    : [];
  return {
    ...version,
    createdByName: createdByUser[0]?.fullName ?? null,
    lockedByName: lockedByUser[0]?.fullName ?? null,
  };
}

const projectVersionsRouter: IRouter = Router({ mergeParams: true });

projectVersionsRouter.get("/", requireAuth, async (req, res): Promise<void> => {
  const { projectId } = req.params as { projectId: string };
  if (!(await verifyProjectAccess(projectId, req.session.tenantId!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const versions = await db.select().from(versionsTable)
    .where(eq(versionsTable.projectId, projectId))
    .orderBy(desc(versionsTable.versionNumber));
  const enriched = await Promise.all(versions.map(enrichVersion));
  res.json(enriched);
});

projectVersionsRouter.post("/clone", requireAuth, async (req, res): Promise<void> => {
  const { projectId } = req.params as { projectId: string };
  if (!(await verifyProjectAccess(projectId, req.session.tenantId!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const { sourceVersionId, notes } = req.body;
  const [source] = await db.select().from(versionsTable).where(eq(versionsTable.id, sourceVersionId));
  if (!source || source.projectId !== projectId) {
    res.status(404).json({ error: "Source version not found" });
    return;
  }

  const existing = await db.select().from(versionsTable).where(eq(versionsTable.projectId, projectId));
  const nextNumber = Math.max(...existing.map(v => v.versionNumber)) + 1;

  const [newVersion] = await db.insert(versionsTable).values({
    id: newId(),
    projectId,
    versionNumber: nextNumber,
    status: "draft",
    createdByUserId: req.session.userId!,
    notes: notes ?? null,
  }).returning();

  const sourceProducts = await db.select().from(productsTable).where(eq(productsTable.versionId, sourceVersionId));
  if (sourceProducts.length > 0) {
    await db.insert(productsTable).values(
      sourceProducts.map(p => ({ ...p, id: newId(), versionId: newVersion.id, createdAt: new Date(), updatedAt: new Date() }))
    );
  }

  res.status(201).json(await enrichVersion(newVersion));
});

export { projectVersionsRouter };

const versionRouter: IRouter = Router({ mergeParams: true });

versionRouter.get("/:versionId", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const [version] = await db.select().from(versionsTable).where(eq(versionsTable.id, versionId));
  if (!version) {
    res.status(404).json({ error: "Version not found" });
    return;
  }
  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, version.projectId), eq(projectsTable.tenantId, req.session.tenantId!)));
  if (!project) {
    res.status(404).json({ error: "Version not found" });
    return;
  }
  res.json(await enrichVersion(version));
});

versionRouter.post("/:versionId/lock", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const role = req.session.role ?? "";
  if (!["admin", "reviewer"].includes(role)) {
    res.status(403).json({ error: "Only admins and reviewers can lock versions" });
    return;
  }

  const [version] = await db.select().from(versionsTable).where(eq(versionsTable.id, versionId));
  if (!version) {
    res.status(404).json({ error: "Version not found" });
    return;
  }
  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, version.projectId), eq(projectsTable.tenantId, req.session.tenantId!)));
  if (!project) {
    res.status(404).json({ error: "Version not found" });
    return;
  }
  if (version.status === "locked") {
    res.status(400).json({ error: "Version is already locked" });
    return;
  }

  const { notes } = req.body ?? {};
  const [locked] = await db.update(versionsTable)
    .set({ status: "locked", lockedAt: new Date(), lockedByUserId: req.session.userId!, notes: notes ?? version.notes })
    .where(eq(versionsTable.id, versionId))
    .returning();

  res.json(await enrichVersion(locked));
});

export default versionRouter;
