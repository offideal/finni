import { db, projectsTable, versionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Project, Version } from "@workspace/db";

export async function getProjectForTenant(
  projectId: string,
  tenantId: string,
): Promise<Project | null> {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(and(eq(projectsTable.id, projectId), eq(projectsTable.tenantId, tenantId)));
  return project ?? null;
}

export async function projectExistsForTenant(projectId: string, tenantId: string): Promise<boolean> {
  const p = await getProjectForTenant(projectId, tenantId);
  return p !== null;
}

/** Version joined with its project; null if version missing or tenant mismatch. */
export async function getVersionWithProjectForTenant(
  versionId: string,
  tenantId: string,
): Promise<{ version: Version; project: Project } | null> {
  const [version] = await db.select().from(versionsTable).where(eq(versionsTable.id, versionId));
  if (!version) return null;
  const project = await getProjectForTenant(version.projectId, tenantId);
  if (!project) return null;
  return { version, project };
}

/** Version only; null if version missing or tenant mismatch. */
export async function getVersionForTenant(
  versionId: string,
  tenantId: string,
): Promise<Version | null> {
  const row = await getVersionWithProjectForTenant(versionId, tenantId);
  return row?.version ?? null;
}

/** Draft version for mutations; locked or missing → error envelope (map to HTTP in routes). */
export type DraftVersionAccess =
  | { ok: true; version: Version }
  | { ok: false; httpStatus: 404 | 400; error: string };

export async function getDraftVersionForTenant(
  versionId: string,
  tenantId: string,
): Promise<DraftVersionAccess> {
  const version = await getVersionForTenant(versionId, tenantId);
  if (!version) return { ok: false, httpStatus: 404, error: "Version not found" };
  if (version.status === "locked") return { ok: false, httpStatus: 400, error: "Version is locked" };
  return { ok: true, version };
}
