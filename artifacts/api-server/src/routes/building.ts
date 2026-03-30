import { Router, type IRouter } from "express";
import { db, buildingsTable, spacesTable, projectsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { newId } from "../lib/id";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router({ mergeParams: true });

async function verifyProjectAccess(projectId: string, tenantId: string): Promise<boolean> {
  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.tenantId, tenantId)));
  return !!project;
}

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const { projectId } = req.params as { projectId: string };
  if (!(await verifyProjectAccess(projectId, req.session.tenantId!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.projectId, projectId));
  if (!building) {
    res.status(404).json({ error: "Building not found" });
    return;
  }

  const spaces = await db.select().from(spacesTable).where(eq(spacesTable.buildingId, building.id));
  res.json({ ...building, spaces });
});

router.put("/", requireAuth, async (req, res): Promise<void> => {
  const { projectId } = req.params as { projectId: string };
  if (!(await verifyProjectAccess(projectId, req.session.tenantId!))) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const { grossAreaM2, spaces = [] } = req.body;

  let [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.projectId, projectId));

  if (!building) {
    [building] = await db.insert(buildingsTable).values({
      id: newId(),
      projectId,
      grossAreaM2: grossAreaM2 ?? null,
    }).returning();
  } else {
    [building] = await db.update(buildingsTable)
      .set({ grossAreaM2: grossAreaM2 ?? null, updatedAt: new Date() })
      .where(eq(buildingsTable.id, building.id))
      .returning();
  }

  await db.delete(spacesTable).where(eq(spacesTable.buildingId, building.id));

  const savedSpaces = spaces.length > 0
    ? await db.insert(spacesTable).values(
        spaces.map((s: { id?: string; name: string; areaM2: number }) => ({
          id: s.id ?? newId(),
          buildingId: building.id,
          name: s.name,
          areaM2: s.areaM2,
        }))
      ).returning()
    : [];

  res.json({ ...building, spaces: savedSpaces });
});

export default router;
