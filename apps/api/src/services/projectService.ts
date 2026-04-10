/**
 * Data / orchestration layer for projects (tenant-scoped).
 * Routes stay thin: parse HTTP → call service → map status codes.
 */
import { db, projectsTable, versionsTable, buildingsTable } from "@workspace/db";
import { eq, and, desc, inArray, count } from "drizzle-orm";
import { newId } from "../lib/id";
import { writeAuditLog } from "./auditService";

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
  const trimmed = input.name.trim();

  const projectId = newId();
  const [project] = await db
    .insert(projectsTable)
    .values({
      id: projectId,
      tenantId: input.tenantId,
      name: trimmed,
      locationCountry: input.locationCountry,
      buildingType: input.buildingType,
      createdByUserId: input.userId,
    })
    .returning();

  const versionId = newId();
  await db.insert(versionsTable).values({
    id: versionId,
    projectId,
    versionNumber: 1,
    status: "draft",
    createdByUserId: input.userId,
  });

  await db.insert(buildingsTable).values({
    id: newId(),
    versionId,
    grossAreaM2: null,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.userId,
    entityType: "project",
    entityId: project.id,
    action: "project.created",
    diff: {
      name: project.name,
      locationCountry: project.locationCountry,
      buildingType: project.buildingType,
    },
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

export async function updateProjectMetadata(input: {
  tenantId: string;
  actorUserId: string;
  projectId: string;
  name?: string;
  locationCountry?: string;
  buildingType?: string;
}): Promise<
  | { ok: true; project: typeof projectsTable.$inferSelect }
  | { ok: false; status: 400 | 404; message: string }
> {
  const [existing] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, input.projectId), eq(projectsTable.tenantId, input.tenantId)));
  if (!existing) {
    return { ok: false, status: 404, message: "Project not found" };
  }
  if (existing.archivedAt) {
    return { ok: false, status: 400, message: "Cannot edit metadata while project is archived" };
  }

  if (
    input.name === undefined &&
    input.locationCountry === undefined &&
    input.buildingType === undefined
  ) {
    return { ok: true, project: existing };
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const t = input.name.trim();
    if (!t) {
      return { ok: false, status: 400, message: "Project name cannot be empty" };
    }
    updates["name"] = t;
  }
  if (input.locationCountry !== undefined) updates["locationCountry"] = input.locationCountry;
  if (input.buildingType !== undefined) updates["buildingType"] = input.buildingType;

  if (Object.keys(updates).length === 1) {
    return { ok: true, project: existing };
  }

  const [project] = await db
    .update(projectsTable)
    .set(updates)
    .where(and(eq(projectsTable.id, input.projectId), eq(projectsTable.tenantId, input.tenantId)))
    .returning();

  if (!project) {
    return { ok: false, status: 404, message: "Project not found" };
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "project",
    entityId: project.id,
    action: "project.updated",
    diff: {
      before: {
        name: existing.name,
        locationCountry: existing.locationCountry,
        buildingType: existing.buildingType,
      },
      after: {
        name: project.name,
        locationCountry: project.locationCountry,
        buildingType: project.buildingType,
      },
    },
  });

  return { ok: true, project };
}

export async function archiveProjectForTenant(input: {
  tenantId: string;
  actorUserId: string;
  projectId: string;
}): Promise<
  | { ok: true; project: typeof projectsTable.$inferSelect }
  | { ok: false; status: 400 | 404; message: string }
> {
  const [existing] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, input.projectId), eq(projectsTable.tenantId, input.tenantId)));
  if (!existing) {
    return { ok: false, status: 404, message: "Project not found" };
  }
  if (existing.archivedAt) {
    return { ok: false, status: 400, message: "Project is already archived" };
  }

  const archivedAt = new Date();
  const [project] = await db
    .update(projectsTable)
    .set({ archivedAt, updatedAt: archivedAt })
    .where(and(eq(projectsTable.id, input.projectId), eq(projectsTable.tenantId, input.tenantId)))
    .returning();

  if (!project) {
    return { ok: false, status: 404, message: "Project not found" };
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "project",
    entityId: project.id,
    action: "project.archived",
    diff: { archivedAt: archivedAt.toISOString() },
  });

  return { ok: true, project };
}

export async function unarchiveProjectForTenant(input: {
  tenantId: string;
  actorUserId: string;
  projectId: string;
}): Promise<
  | { ok: true; project: typeof projectsTable.$inferSelect }
  | { ok: false; status: 400 | 404; message: string }
> {
  const [existing] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, input.projectId), eq(projectsTable.tenantId, input.tenantId)));
  if (!existing) {
    return { ok: false, status: 404, message: "Project not found" };
  }
  if (!existing.archivedAt) {
    return { ok: false, status: 400, message: "Project is not archived" };
  }

  const [project] = await db
    .update(projectsTable)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(and(eq(projectsTable.id, input.projectId), eq(projectsTable.tenantId, input.tenantId)))
    .returning();

  if (!project) {
    return { ok: false, status: 404, message: "Project not found" };
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "project",
    entityId: project.id,
    action: "project.restored",
    diff: { wasArchivedAt: existing.archivedAt?.toISOString() ?? null },
  });

  return { ok: true, project };
}
