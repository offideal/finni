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

/** Mutations that change project data (building, versions, products, reports) require a non-archived project. */
export async function requireWritableProject(
  projectId: string,
  tenantId: string,
): Promise<{ ok: true; project: Project } | { ok: false; httpStatus: 404 | 400; error: string }> {
  const p = await getProjectForTenant(projectId, tenantId);
  if (!p) return { ok: false, httpStatus: 404, error: "Project not found" };
  if (p.archivedAt != null) return { ok: false, httpStatus: 400, error: "Project is archived" };
  return { ok: true, project: p };
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

export const VERSION_LOCKED_ERROR_CODE = "VERSION_LOCKED" as const;
export const PROJECT_ARCHIVED_ERROR_CODE = "PROJECT_ARCHIVED" as const;

/** Draft version for mutations; locked or missing → error envelope (map to HTTP in routes). */
export type DraftVersionAccess =
  | { ok: true; version: Version }
  | { ok: false; httpStatus: 404 | 400; error: string; code?: string };

export function draftAccessFailureBody(access: Extract<DraftVersionAccess, { ok: false }>): {
  error: string;
  code?: string;
} {
  return access.code !== undefined ? { error: access.error, code: access.code } : { error: access.error };
}

export async function getDraftVersionForTenant(
  versionId: string,
  tenantId: string,
): Promise<DraftVersionAccess> {
  const row = await getVersionWithProjectForTenant(versionId, tenantId);
  if (!row) return { ok: false, httpStatus: 404, error: "Version not found" };
  if (row.project.archivedAt) {
    return {
      ok: false,
      httpStatus: 400,
      error: "Project is archived",
      code: PROJECT_ARCHIVED_ERROR_CODE,
    };
  }
  if (row.version.status === "locked") {
    return {
      ok: false,
      httpStatus: 400,
      error:
        "This version is locked and cannot be edited. Clone this version or create a new draft to make changes.",
      code: VERSION_LOCKED_ERROR_CODE,
    };
  }
  return { ok: true, version: row.version };
}
