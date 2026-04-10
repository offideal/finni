import { db, versionsTable, productsTable, buildingsTable, spacesTable, usersTable } from "@workspace/db";
import { eq, asc, count } from "drizzle-orm";
import { newId } from "../lib/id";
import { writeAuditLog } from "./auditService";
import { getProjectForTenant, getVersionWithProjectForTenant } from "../access/tenantResources";
import { copyBuildingBetweenVersions } from "./buildingService";
import { validateVersionForApproval } from "../domain/validationChecks";
import { loadVersionValidationContext } from "./validationService";

export async function enrichVersion(version: typeof versionsTable.$inferSelect) {
  const createdByUser = version.createdByUserId
    ? await db
        .select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, version.createdByUserId))
        .limit(1)
    : [];
  const lockedByUser = version.lockedByUserId
    ? await db
        .select({ fullName: usersTable.fullName })
        .from(usersTable)
        .where(eq(usersTable.id, version.lockedByUserId))
        .limit(1)
    : [];
  return {
    ...version,
    createdByName: createdByUser[0]?.fullName ?? null,
    lockedByName: lockedByUser[0]?.fullName ?? null,
  };
}

function numEq(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) < 1e-9;
}

/** Post-copy checks: counts and building snapshot match source (deterministic clone). */
export async function assertCloneIntegrity(sourceVersionId: string, targetVersionId: string): Promise<void> {
  const [{ n: srcPc }] = await db
    .select({ n: count() })
    .from(productsTable)
    .where(eq(productsTable.versionId, sourceVersionId));
  const [{ n: tgtPc }] = await db
    .select({ n: count() })
    .from(productsTable)
    .where(eq(productsTable.versionId, targetVersionId));
  if (Number(srcPc) !== Number(tgtPc)) {
    throw new Error(`Clone integrity: product count mismatch (source ${srcPc}, target ${tgtPc})`);
  }

  const [srcB] = await db.select().from(buildingsTable).where(eq(buildingsTable.versionId, sourceVersionId));
  const [tgtB] = await db.select().from(buildingsTable).where(eq(buildingsTable.versionId, targetVersionId));
  if (!tgtB) {
    throw new Error("Clone integrity: target building row missing");
  }
  if (srcB) {
    if (!numEq(srcB.grossAreaM2, tgtB.grossAreaM2)) {
      throw new Error("Clone integrity: gross area mismatch");
    }
    const srcSp = await db.select().from(spacesTable).where(eq(spacesTable.buildingId, srcB.id));
    const tgtSp = await db.select().from(spacesTable).where(eq(spacesTable.buildingId, tgtB.id));
    if (srcSp.length !== tgtSp.length) {
      throw new Error("Clone integrity: space count mismatch");
    }
    const srcSum = srcSp.reduce((s, x) => s + x.areaM2, 0);
    const tgtSum = tgtSp.reduce((s, x) => s + x.areaM2, 0);
    if (!numEq(srcSum, tgtSum)) {
      throw new Error("Clone integrity: space area sum mismatch");
    }
  }
}

async function nextVersionNumber(projectId: string): Promise<number> {
  const existing = await db.select().from(versionsTable).where(eq(versionsTable.projectId, projectId));
  return existing.length === 0 ? 1 : Math.max(...existing.map((v) => v.versionNumber)) + 1;
}

export async function createEmptyDraftVersion(input: {
  tenantId: string;
  userId: string;
  projectId: string;
  notes?: string | null;
}): Promise<typeof versionsTable.$inferSelect> {
  const project = await getProjectForTenant(input.projectId, input.tenantId);
  if (!project) {
    throw new Error("Project not found");
  }
  if (project.archivedAt) {
    throw new Error("Project is archived");
  }

  const versionNumber = await nextVersionNumber(input.projectId);
  const versionId = newId();

  const [newVersion] = await db
    .insert(versionsTable)
    .values({
      id: versionId,
      projectId: input.projectId,
      versionNumber,
      status: "draft",
      createdByUserId: input.userId,
      notes: input.notes ?? null,
    })
    .returning();

  await db.insert(buildingsTable).values({
    id: newId(),
    versionId: newVersion.id,
    grossAreaM2: null,
  });

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.userId,
    entityType: "version",
    entityId: newVersion.id,
    action: "version.created",
    diff: {
      projectId: input.projectId,
      versionNumber: newVersion.versionNumber,
      notes: newVersion.notes,
      mode: "empty_draft",
    },
  });

  return newVersion;
}

export async function cloneVersionFromSource(input: {
  tenantId: string;
  userId: string;
  projectId: string;
  sourceVersionId: string;
  notes?: string | null;
}): Promise<typeof versionsTable.$inferSelect> {
  const [source] = await db.select().from(versionsTable).where(eq(versionsTable.id, input.sourceVersionId));
  if (!source || source.projectId !== input.projectId) {
    throw new Error("Source version not found");
  }

  const versionNumber = await nextVersionNumber(input.projectId);
  const newVersionId = newId();

  const [newVersion] = await db
    .insert(versionsTable)
    .values({
      id: newVersionId,
      projectId: input.projectId,
      versionNumber,
      status: "draft",
      createdByUserId: input.userId,
      notes: input.notes ?? null,
    })
    .returning();

  const sourceProducts = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.versionId, input.sourceVersionId))
    .orderBy(asc(productsTable.id));

  if (sourceProducts.length > 0) {
    await db.insert(productsTable).values(
      sourceProducts.map((p) => ({
        ...p,
        id: newId(),
        versionId: newVersion.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  }

  const [srcBuilding] = await db.select().from(buildingsTable).where(eq(buildingsTable.versionId, input.sourceVersionId));
  if (srcBuilding) {
    await copyBuildingBetweenVersions({
      sourceVersionId: input.sourceVersionId,
      targetVersionId: newVersion.id,
    });
  } else {
    await db.insert(buildingsTable).values({
      id: newId(),
      versionId: newVersion.id,
      grossAreaM2: null,
    });
  }

  await assertCloneIntegrity(input.sourceVersionId, newVersion.id);

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.userId,
    entityType: "version",
    entityId: newVersion.id,
    action: "version.cloned",
    diff: {
      projectId: input.projectId,
      sourceVersionId: input.sourceVersionId,
      versionNumber: newVersion.versionNumber,
      productCount: sourceProducts.length,
      notes: newVersion.notes,
    },
  });

  return newVersion;
}

export const LOCK_PRECONDITIONS_FAILED_CODE = "LOCK_PRECONDITIONS_FAILED" as const;

/** Same rules as approval/validation: all error-level checks must pass before lock. */
export async function evaluateVersionLockPreconditions(
  tenantId: string,
  versionId: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      httpStatus: 404 | 400;
      error: string;
      code?: typeof LOCK_PRECONDITIONS_FAILED_CODE;
      summary?: string;
      failedChecks?: Array<{ id: string; message: string }>;
    }
> {
  const ctx = await loadVersionValidationContext(tenantId, versionId);
  if (!ctx) {
    return { ok: false, httpStatus: 404, error: "Version not found" };
  }
  const { version } = ctx;
  if (version.status !== "draft") {
    if (version.status === "locked") {
      return { ok: false, httpStatus: 400, error: "Version is already locked" };
    }
    return { ok: false, httpStatus: 400, error: "Only draft versions can be locked" };
  }

  const { passed, checks } = validateVersionForApproval({
    version,
    building: ctx.building,
    products: ctx.products,
    project: { id: ctx.project.id, name: ctx.project.name },
  });
  const failed = checks.filter((c) => c.severity === "error" && !c.passed);
  if (passed) {
    return { ok: true };
  }

  return {
    ok: false,
    httpStatus: 400,
    error: "Cannot lock: validation requirements are not met.",
    code: LOCK_PRECONDITIONS_FAILED_CODE,
    summary: `${failed.length} requirement(s) not met`,
    failedChecks: failed.map((c) => ({ id: c.id, message: c.message })),
  };
}

export async function recordVersionLocked(input: {
  tenantId: string;
  actorUserId: string;
  versionId: string;
  projectId: string;
  versionNumber: number;
  notes: string | null;
  lockedAt: Date;
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "version",
    entityId: input.versionId,
    action: "version.locked",
    diff: {
      projectId: input.projectId,
      versionNumber: input.versionNumber,
      notes: input.notes,
      lockedAt: input.lockedAt.toISOString(),
    },
  });
}
