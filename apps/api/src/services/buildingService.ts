import { db, buildingsTable, spacesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { newId } from "../lib/id";
import { getVersionWithProjectForTenant, getDraftVersionForTenant, requireWritableProject } from "../access/tenantResources";
import { writeAuditLog } from "./auditService";

export type BuildingWithSpaces = typeof buildingsTable.$inferSelect & {
  spaces: Array<typeof spacesTable.$inferSelect>;
};

export type UpsertBuildingInput = {
  grossAreaM2: number | null;
  spaces: Array<{ id?: string; name: string; areaM2: number }>;
};

const SUM_EPS = 1e-6;

export function validateBuildingPayload(input: UpsertBuildingInput): { ok: true } | { ok: false; message: string } {
  if (input.grossAreaM2 == null || Number.isNaN(input.grossAreaM2)) {
    return { ok: false, message: "Gross area (m²) is required" };
  }
  if (input.grossAreaM2 < 0) {
    return { ok: false, message: "Gross area cannot be negative" };
  }

  for (let i = 0; i < input.spaces.length; i++) {
    const s = input.spaces[i]!;
    const name = s.name?.trim() ?? "";
    if (!name) {
      return { ok: false, message: `Space ${i + 1}: name is required` };
    }
    if (s.areaM2 == null || Number.isNaN(s.areaM2)) {
      return { ok: false, message: `Space "${name}": area is required` };
    }
    if (s.areaM2 < 0) {
      return { ok: false, message: `Space "${name}": area cannot be negative` };
    }
  }

  const sumSpaces = input.spaces.reduce((acc, s) => acc + s.areaM2, 0);
  if (sumSpaces > input.grossAreaM2 + SUM_EPS) {
    return {
      ok: false,
      message: `Sum of space areas (${sumSpaces.toFixed(2)} m²) cannot exceed gross area (${input.grossAreaM2.toFixed(2)} m²)`,
    };
  }

  return { ok: true };
}

export async function getBuildingForVersionContext(input: {
  tenantId: string;
  projectId: string;
  versionId: string;
}): Promise<
  | { ok: true; building: BuildingWithSpaces }
  | { ok: false; status: 404; message: string }
> {
  const row = await getVersionWithProjectForTenant(input.versionId, input.tenantId);
  if (!row || row.project.id !== input.projectId) {
    return { ok: false, status: 404, message: "Version not found" };
  }

  let [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.versionId, input.versionId));

  if (!building) {
    [building] = await db
      .insert(buildingsTable)
      .values({
        id: newId(),
        versionId: input.versionId,
        grossAreaM2: null,
      })
      .returning();
  }

  const spaces = await db.select().from(spacesTable).where(eq(spacesTable.buildingId, building.id));
  return { ok: true, building: { ...building, spaces } };
}

export async function upsertBuildingForVersion(input: {
  tenantId: string;
  actorUserId: string;
  projectId: string;
  versionId: string;
  body: UpsertBuildingInput;
}): Promise<
  | { ok: true; building: BuildingWithSpaces }
  | { ok: false; status: 400 | 403 | 404; message: string; code?: string }
> {
  const row = await getVersionWithProjectForTenant(input.versionId, input.tenantId);
  if (!row || row.project.id !== input.projectId) {
    return { ok: false, status: 404, message: "Version not found" };
  }

  const projectGate = await requireWritableProject(input.projectId, input.tenantId);
  if (!projectGate.ok) {
    return { ok: false, status: projectGate.httpStatus, message: projectGate.error };
  }

  const draft = await getDraftVersionForTenant(input.versionId, input.tenantId);
  if (!draft.ok) {
    return {
      ok: false,
      status: draft.httpStatus,
      message: draft.error,
      ...(draft.code !== undefined ? { code: draft.code } : {}),
    };
  }

  const validated = validateBuildingPayload(input.body);
  if (!validated.ok) {
    return { ok: false, status: 400, message: validated.message };
  }

  let [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.versionId, input.versionId));

  const beforeSnapshot =
    building != null
      ? {
          grossAreaM2: building.grossAreaM2,
          spaces: await db.select().from(spacesTable).where(eq(spacesTable.buildingId, building.id)),
        }
      : null;

  if (!building) {
    [building] = await db
      .insert(buildingsTable)
      .values({
        id: newId(),
        versionId: input.versionId,
        grossAreaM2: input.body.grossAreaM2,
      })
      .returning();
  } else {
    [building] = await db
      .update(buildingsTable)
      .set({ grossAreaM2: input.body.grossAreaM2, updatedAt: new Date() })
      .where(eq(buildingsTable.id, building.id))
      .returning();
  }

  await db.delete(spacesTable).where(eq(spacesTable.buildingId, building.id));

  const savedSpaces =
    input.body.spaces.length > 0
      ? await db
          .insert(spacesTable)
          .values(
            input.body.spaces.map((s) => ({
              id: newId(),
              buildingId: building.id,
              name: s.name.trim(),
              areaM2: s.areaM2,
            })),
          )
          .returning()
      : [];

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "building",
    entityId: building.id,
    action: "building.updated",
    diff: {
      versionId: input.versionId,
      projectId: input.projectId,
      before: beforeSnapshot,
      after: {
        grossAreaM2: building.grossAreaM2,
        spaces: savedSpaces.map((s) => ({ name: s.name, areaM2: s.areaM2 })),
      },
    },
  });

  return { ok: true, building: { ...building, spaces: savedSpaces } };
}

/** Copy building + spaces from one version to another (e.g. version clone). */
export async function copyBuildingBetweenVersions(input: {
  sourceVersionId: string;
  targetVersionId: string;
}): Promise<void> {
  const [source] = await db.select().from(buildingsTable).where(eq(buildingsTable.versionId, input.sourceVersionId));
  if (!source) return;

  const [inserted] = await db
    .insert(buildingsTable)
    .values({
      id: newId(),
      versionId: input.targetVersionId,
      grossAreaM2: source.grossAreaM2,
    })
    .returning();

  const srcSpaces = await db.select().from(spacesTable).where(eq(spacesTable.buildingId, source.id));
  if (srcSpaces.length > 0) {
    await db.insert(spacesTable).values(
      srcSpaces.map((s) => ({
        id: newId(),
        buildingId: inserted.id,
        name: s.name,
        areaM2: s.areaM2,
      })),
    );
  }
}
