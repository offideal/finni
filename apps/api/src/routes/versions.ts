import { Router, type IRouter } from "express";
import { db, versionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireTenantEditor } from "../middlewares/requireAuth";
import { VERSION_LOCK_ROLES } from "../auth/roles";
import {
  projectExistsForTenant,
  getVersionWithProjectForTenant,
  requireWritableProject,
} from "../access/tenantResources";
import {
  enrichVersion,
  createEmptyDraftVersion,
  cloneVersionFromSource,
  recordVersionLocked,
  evaluateVersionLockPreconditions,
} from "../services/versionService";

const router: IRouter = Router({ mergeParams: true });

const projectVersionsRouter: IRouter = Router({ mergeParams: true });

projectVersionsRouter.get("/", requireAuth, async (req, res): Promise<void> => {
  const { projectId } = req.params as { projectId: string };
  if (!(await projectExistsForTenant(projectId, req.session.tenantId!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const versions = await db
    .select()
    .from(versionsTable)
    .where(eq(versionsTable.projectId, projectId))
    .orderBy(desc(versionsTable.versionNumber));
  const enriched = await Promise.all(versions.map(enrichVersion));
  res.json(enriched);
});

/** Create a new empty draft version (next version number, empty products, empty building row). */
projectVersionsRouter.post("/", requireTenantEditor, async (req, res): Promise<void> => {
  const { projectId } = req.params as { projectId: string };
  const access = await requireWritableProject(projectId, req.session.tenantId!);
  if (!access.ok) {
    res.status(access.httpStatus).json({ error: access.error });
    return;
  }

  const notes = req.body?.notes ?? null;
  try {
    const row = await createEmptyDraftVersion({
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      projectId,
      notes: typeof notes === "string" ? notes : null,
    });
    res.status(201).json(await enrichVersion(row));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to create version";
    if (msg === "Project not found") {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg === "Project is archived") {
      res.status(400).json({ error: msg });
      return;
    }
    res.status(400).json({ error: msg });
  }
});

projectVersionsRouter.post("/clone", requireTenantEditor, async (req, res): Promise<void> => {
  const { projectId } = req.params as { projectId: string };
  const access = await requireWritableProject(projectId, req.session.tenantId!);
  if (!access.ok) {
    res.status(access.httpStatus).json({ error: access.error });
    return;
  }

  const { sourceVersionId, notes } = req.body as { sourceVersionId?: string; notes?: string | null };
  if (!sourceVersionId) {
    res.status(400).json({ error: "sourceVersionId is required" });
    return;
  }

  try {
    const row = await cloneVersionFromSource({
      tenantId: req.session.tenantId!,
      userId: req.session.userId!,
      projectId,
      sourceVersionId,
      notes: notes ?? null,
    });
    res.status(201).json(await enrichVersion(row));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Clone failed";
    if (msg === "Source version not found") {
      res.status(404).json({ error: msg });
      return;
    }
    if (msg.startsWith("Clone integrity:")) {
      res.status(500).json({ error: msg });
      return;
    }
    res.status(400).json({ error: msg });
  }
});

export { projectVersionsRouter };

const versionRouter: IRouter = Router({ mergeParams: true });

versionRouter.get("/:versionId", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const row = await getVersionWithProjectForTenant(versionId, req.session.tenantId!);
  if (!row) {
    res.status(404).json({ error: "Version not found" });
    return;
  }
  res.json(await enrichVersion(row.version));
});

versionRouter.post("/:versionId/lock", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const role = req.session.role ?? "";
  if (!VERSION_LOCK_ROLES.includes(role as (typeof VERSION_LOCK_ROLES)[number])) {
    res.status(403).json({ error: "Only admins and reviewers can lock versions" });
    return;
  }

  const row = await getVersionWithProjectForTenant(versionId, req.session.tenantId!);
  if (!row) {
    res.status(404).json({ error: "Version not found" });
    return;
  }
  const { version, project } = row;

  if (project.archivedAt) {
    res.status(400).json({ error: "Project is archived" });
    return;
  }

  const pre = await evaluateVersionLockPreconditions(req.session.tenantId!, versionId);
  if (!pre.ok) {
    res.status(pre.httpStatus).json({
      error: pre.error,
      ...(pre.code !== undefined && { code: pre.code }),
      ...(pre.summary !== undefined && { summary: pre.summary }),
      ...(pre.failedChecks !== undefined && { failedChecks: pre.failedChecks }),
    });
    return;
  }

  const { notes } = req.body ?? {};
  const [locked] = await db
    .update(versionsTable)
    .set({
      status: "locked",
      lockedAt: new Date(),
      lockedByUserId: req.session.userId!,
      notes: notes ?? version.notes,
    })
    .where(eq(versionsTable.id, versionId))
    .returning();

  if (!locked) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  await recordVersionLocked({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    versionId: locked.id,
    projectId: project.id,
    versionNumber: locked.versionNumber,
    notes: locked.notes ?? null,
    lockedAt: locked.lockedAt!,
  });

  res.json(await enrichVersion(locked));
});

export default versionRouter;
