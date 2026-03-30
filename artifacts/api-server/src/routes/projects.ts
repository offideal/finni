import { Router, type IRouter } from "express";
import { db, projectsTable, versionsTable, usersTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { newId } from "../lib/id";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable)
    .where(eq(projectsTable.tenantId, req.session.tenantId!))
    .orderBy(desc(projectsTable.updatedAt));

  const result = await Promise.all(projects.map(async (p) => {
    const versions = await db.select().from(versionsTable)
      .where(eq(versionsTable.projectId, p.id))
      .orderBy(desc(versionsTable.versionNumber))
      .limit(1);
    const latest = versions[0];
    return {
      ...p,
      latestVersionStatus: latest?.status ?? null,
      latestVersionNumber: latest?.versionNumber ?? null,
    };
  }));

  res.json(result);
});

router.post("/", requireAuth, async (req, res): Promise<void> => {
  const { name, locationCountry, buildingType } = req.body;
  if (!name || !buildingType) {
    res.status(400).json({ error: "Name and buildingType required" });
    return;
  }

  const projectId = newId();
  const [project] = await db.insert(projectsTable).values({
    id: projectId,
    tenantId: req.session.tenantId!,
    name,
    locationCountry: locationCountry ?? "FI",
    buildingType,
    createdByUserId: req.session.userId!,
  }).returning();

  await db.insert(versionsTable).values({
    id: newId(),
    projectId,
    versionNumber: 1,
    status: "draft",
    createdByUserId: req.session.userId!,
  });

  res.status(201).json(project);
});

router.get("/:id", requireAuth, async (req, res): Promise<void> => {
  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, req.params["id"]!), eq(projectsTable.tenantId, req.session.tenantId!)));
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

router.patch("/:id", requireAuth, async (req, res): Promise<void> => {
  const { name, locationCountry, buildingType } = req.body;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates["name"] = name;
  if (locationCountry !== undefined) updates["locationCountry"] = locationCountry;
  if (buildingType !== undefined) updates["buildingType"] = buildingType;

  const [project] = await db.update(projectsTable)
    .set(updates)
    .where(and(eq(projectsTable.id, req.params["id"]!), eq(projectsTable.tenantId, req.session.tenantId!)))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(project);
});

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable)
    .where(eq(projectsTable.tenantId, req.session.tenantId!))
    .orderBy(desc(projectsTable.updatedAt));

  const allVersions = await Promise.all(projects.map(p =>
    db.select().from(versionsTable).where(eq(versionsTable.projectId, p.id))
  ));
  const flatVersions = allVersions.flat();

  const recentProjects = await Promise.all(projects.slice(0, 5).map(async (p) => {
    const versions = flatVersions.filter(v => v.projectId === p.id)
      .sort((a, b) => b.versionNumber - a.versionNumber);
    const latest = versions[0];
    return {
      ...p,
      latestVersionStatus: latest?.status ?? null,
      latestVersionNumber: latest?.versionNumber ?? null,
    };
  }));

  res.json({
    totalProjects: projects.length,
    draftVersions: flatVersions.filter(v => v.status === "draft").length,
    lockedVersions: flatVersions.filter(v => v.status === "locked").length,
    totalProducts: 0,
    recentProjects,
  });
});

export { router as projectsRouter };
export default router;
