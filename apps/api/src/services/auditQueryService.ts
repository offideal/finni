import { db, auditLogsTable, versionsTable, buildingsTable, productsTable, usersTable } from "@workspace/db";
import { eq, and, or, desc, asc, inArray } from "drizzle-orm";
import type { AuditLog } from "@workspace/db";

const DEFAULT_LIMIT = 500;

/** Safe subset of diff JSON for API clients (no raw secrets; size-capped). */
export function sanitizeAuditDiffJson(diffJson: string | null): unknown | null {
  if (diffJson == null || diffJson === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(diffJson) as unknown;
  } catch {
    return { _parseError: true };
  }
  return sanitizeValue(parsed, 0);
}

const SENSITIVE_KEY = /^(password|passwordHash|token|secret|authorization)$/i;
const MAX_STRING = 400;
const MAX_DEPTH = 6;
const MAX_KEYS = 40;
const MAX_ARRAY = 30;

function sanitizeValue(v: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (v === null || typeof v === "boolean" || typeof v === "number") return v;
  if (typeof v === "string") {
    return v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}…` : v;
  }
  if (Array.isArray(v)) {
    const slice = v.slice(0, MAX_ARRAY).map((x) => sanitizeValue(x, depth + 1));
    if (v.length > MAX_ARRAY) {
      return [...slice, `… +${v.length - MAX_ARRAY} more`];
    }
    return slice;
  }
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o).slice(0, MAX_KEYS);
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = sanitizeValue(o[k], depth + 1);
    }
    if (Object.keys(o).length > MAX_KEYS) {
      out["_truncatedKeys"] = true;
    }
    return out;
  }
  return String(v);
}

export type AuditLogRowPublic = Omit<AuditLog, "tenantId" | "diffJson"> & {
  userName: string | null;
  diffPreview: unknown | null;
};

async function enrichAuditRows(logs: AuditLog[]): Promise<AuditLogRowPublic[]> {
  if (logs.length === 0) return [];
  const userIds = [...new Set(logs.map((l) => l.userId))];
  const users = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));

  return logs.map((log) => {
    const { tenantId: _t, diffJson, ...rest } = log;
    return {
      ...rest,
      userName: nameById.get(log.userId) ?? null,
      diffPreview: sanitizeAuditDiffJson(diffJson),
    };
  });
}

async function fetchVersionIdsForProject(projectId: string): Promise<string[]> {
  const rows = await db
    .select({ id: versionsTable.id })
    .from(versionsTable)
    .where(eq(versionsTable.projectId, projectId));
  return rows.map((r) => r.id);
}

async function fetchBuildingIdsForVersions(versionIds: string[]): Promise<string[]> {
  if (versionIds.length === 0) return [];
  const rows = await db
    .select({ id: buildingsTable.id })
    .from(buildingsTable)
    .where(inArray(buildingsTable.versionId, versionIds));
  return rows.map((r) => r.id);
}

async function fetchProductIdsForVersions(versionIds: string[]): Promise<string[]> {
  if (versionIds.length === 0) return [];
  const rows = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(inArray(productsTable.versionId, versionIds));
  return rows.map((r) => r.id);
}

/** All audit rows relevant to a project (project metadata, versions, building, products, exports). */
export async function listAuditEventsForProject(
  tenantId: string,
  projectId: string,
  limit = DEFAULT_LIMIT,
): Promise<AuditLogRowPublic[]> {
  const versionIds = await fetchVersionIdsForProject(projectId);
  const buildingIds = await fetchBuildingIdsForVersions(versionIds);
  const productIds = await fetchProductIdsForVersions(versionIds);

  const parts = [
    and(eq(auditLogsTable.entityType, "project"), eq(auditLogsTable.entityId, projectId)),
  ];
  if (versionIds.length > 0) {
    parts.push(and(eq(auditLogsTable.entityType, "version"), inArray(auditLogsTable.entityId, versionIds)));
  }
  if (buildingIds.length > 0) {
    parts.push(and(eq(auditLogsTable.entityType, "building"), inArray(auditLogsTable.entityId, buildingIds)));
  }
  if (productIds.length > 0) {
    parts.push(and(eq(auditLogsTable.entityType, "product"), inArray(auditLogsTable.entityId, productIds)));
  }

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.tenantId, tenantId), or(...parts)))
    .orderBy(desc(auditLogsTable.createdAt), asc(auditLogsTable.id))
    .limit(Math.min(limit, 1000));

  return enrichAuditRows(logs);
}

/** Audit rows for a single version (version, its building, products, exports). */
export async function listAuditEventsForVersion(
  tenantId: string,
  projectId: string,
  versionId: string,
  limit = DEFAULT_LIMIT,
): Promise<AuditLogRowPublic[]> {
  const [ver] = await db
    .select()
    .from(versionsTable)
    .where(and(eq(versionsTable.id, versionId), eq(versionsTable.projectId, projectId)));
  if (!ver) {
    return [];
  }

  const buildingIds = await fetchBuildingIdsForVersions([versionId]);
  const productIds = await fetchProductIdsForVersions([versionId]);

  const parts = [and(eq(auditLogsTable.entityType, "version"), eq(auditLogsTable.entityId, versionId))];
  if (buildingIds.length > 0) {
    parts.push(and(eq(auditLogsTable.entityType, "building"), inArray(auditLogsTable.entityId, buildingIds)));
  }
  if (productIds.length > 0) {
    parts.push(and(eq(auditLogsTable.entityType, "product"), inArray(auditLogsTable.entityId, productIds)));
  }

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.tenantId, tenantId), or(...parts)))
    .orderBy(desc(auditLogsTable.createdAt), asc(auditLogsTable.id))
    .limit(Math.min(limit, 1000));

  return enrichAuditRows(logs);
}
