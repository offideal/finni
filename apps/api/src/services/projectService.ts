/**
 * Data / orchestration layer for projects (tenant-scoped).
 * Routes stay thin: parse HTTP → call service → map status codes.
 */
import { db, projectsTable, versionsTable } from "@workspace/db";
import { eq, and, desc, inArray, count } from "drizzle-orm";
import { newId } from "../lib/id";

export async function listProjectsPaginated(
  tenantId: string,
  limit: number,
  offset: number,
): Promise<{
  items: Array<
    (typeof projectsTable.$inferSelect) & {
      latestVersionStatus: string | null;
      latestVersionNumber: number | null;
    }
  >;
  total: number;
  limit: number;
  offset: number;
}> {
  const [{ total: totalCount }] = await db
    .select({ total: count() })
    .from(projectsTable)
    .where(eq(projectsTable.tenantId, tenantId));
  const total = Number(totalCount);

  if (total === 0) {
    return { items: [], total: 0, limit, offset };
  }

  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.tenantId, tenantId))
    .orderBy(desc(projectsTable.updatedAt))
    .limit(limit)
    .offset(offset);

  const projectIds = projects.map((p) => p.id);
  const allVersions = await db
    .select()
    .from(versionsTable)
    .where(inArray(versionsTable.projectId, projectIds));

  const latestByProject = new Map<string, (typeof allVersions)[0]>();
  for (const v of allVersions) {
    const cur = latestByProject.get(v.projectId);
    if (!cur || v.versionNumber > cur.versionNumber) latestByProject.set(v.projectId, v);
  }

  const items = projects.map((p) => {
    const latest = latestByProject.get(p.id);
    return {
      ...p,
      latestVersionStatus: latest?.status ?? null,
      latestVersionNumber: latest?.versionNumber ?? null,
    };
  });

  return { items, total, limit, offset };
}

export async function createProjectWithInitialVersion(input: {
  tenantId: string;
  userId: string;
  name: string;
  locationCountry: string;
  buildingType: string;
}): Promise<typeof projectsTable.$inferSelect> {
  const projectId = newId();
  const [project] = await db
    .insert(projectsTable)
    .values({
      id: projectId,
      tenantId: input.tenantId,
      name: input.name,
      locationCountry: input.locationCountry,
      buildingType: input.buildingType,
      createdByUserId: input.userId,
    })
    .returning();

  await db.insert(versionsTable).values({
    id: newId(),
    projectId,
    versionNumber: 1,
    status: "draft",
    createdByUserId: input.userId,
  });

  return project;
}

export async function getDashboardSummaryForTenant(tenantId: string): Promise<{
  totalProjects: number;
  draftVersions: number;
  lockedVersions: number;
  totalProducts: number;
  recentProjects: Array<
    (typeof projectsTable.$inferSelect) & {
      latestVersionStatus: string | null;
      latestVersionNumber: number | null;
    }
  >;
}> {
  const projects = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.tenantId, tenantId))
    .orderBy(desc(projectsTable.updatedAt));

  if (projects.length === 0) {
    return {
      totalProjects: 0,
      draftVersions: 0,
      lockedVersions: 0,
      totalProducts: 0,
      recentProjects: [],
    };
  }

  const projectIds = projects.map((p) => p.id);
  const allVersions = await db
    .select()
    .from(versionsTable)
    .where(inArray(versionsTable.projectId, projectIds));

  const latestByProject = new Map<string, (typeof allVersions)[0]>();
  for (const v of allVersions) {
    const cur = latestByProject.get(v.projectId);
    if (!cur || v.versionNumber > cur.versionNumber) latestByProject.set(v.projectId, v);
  }

  const recentProjects = projects.slice(0, 5).map((p) => {
    const latest = latestByProject.get(p.id);
    return {
      ...p,
      latestVersionStatus: latest?.status ?? null,
      latestVersionNumber: latest?.versionNumber ?? null,
    };
  });

  return {
    totalProjects: projects.length,
    draftVersions: allVersions.filter((v) => v.status === "draft").length,
    lockedVersions: allVersions.filter((v) => v.status === "locked").length,
    totalProducts: 0,
    recentProjects,
  };
}

export async function updateProjectForTenant(
  tenantId: string,
  projectId: string,
  updates: Record<string, unknown>,
): Promise<(typeof projectsTable.$inferSelect) | null> {
  const [project] = await db
    .update(projectsTable)
    .set(updates)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.tenantId, tenantId)))
    .returning();
  return project ?? null;
}
