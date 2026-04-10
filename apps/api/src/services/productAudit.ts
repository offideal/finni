import { writeAuditLog } from "./auditService";

export async function auditProductCreated(input: {
  tenantId: string;
  actorUserId: string;
  versionId: string;
  productId: string;
  name: string;
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "product",
    entityId: input.productId,
    action: "product.created",
    diff: {
      versionId: input.versionId,
      name: input.name,
    },
  });
}

export async function auditProductUpdated(input: {
  tenantId: string;
  actorUserId: string;
  versionId: string;
  productId: string;
  name: string;
  patchKeys: string[];
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "product",
    entityId: input.productId,
    action: "product.updated",
    diff: {
      versionId: input.versionId,
      name: input.name,
      patchKeys: input.patchKeys,
    },
  });
}

export async function auditProductDeleted(input: {
  tenantId: string;
  actorUserId: string;
  versionId: string;
  productId: string;
  name: string;
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "product",
    entityId: input.productId,
    action: "product.deleted",
    diff: {
      versionId: input.versionId,
      name: input.name,
    },
  });
}

export async function auditProductDuplicated(input: {
  tenantId: string;
  actorUserId: string;
  versionId: string;
  sourceProductId: string;
  newProductId: string;
  name: string;
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "product",
    entityId: input.newProductId,
    action: "product.duplicated",
    diff: {
      versionId: input.versionId,
      sourceProductId: input.sourceProductId,
      name: input.name,
    },
  });
}

/** Emission factor attach/detach: snapshots for traceability (ids + factors used in CO₂e). */
export async function auditProductImportBatch(input: {
  tenantId: string;
  actorUserId: string;
  versionId: string;
  projectId: string;
  productIds: string[];
  format: "excel" | "ifc";
  /** Set when IFC/BIM commit also applied building snapshot. */
  buildingImported?: boolean;
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "version",
    entityId: input.versionId,
    action: "product.import.batch",
    diff: {
      projectId: input.projectId,
      format: input.format,
      count: input.productIds.length,
      productIdsSample: input.productIds.slice(0, 40),
      idsTruncated: input.productIds.length > 40,
      ...(input.buildingImported === true ? { buildingImported: true } : {}),
    },
  });
}

export async function auditProductEmissionFactorChanged(input: {
  tenantId: string;
  actorUserId: string;
  versionId: string;
  productId: string;
  productName: string;
  before: {
    emissionFactorId: string | null;
    emissionSourceName: string | null;
    emissionSourceType: string | null;
    emissionUnitSnapshot: string | null;
    co2ePerUnitSnapshot: number | null;
    emissionExternalSourceKey?: string | null;
    emissionExternalRecordId?: string | null;
  };
  after: {
    emissionFactorId: string | null;
    emissionSourceName: string | null;
    emissionSourceType: string | null;
    emissionUnitSnapshot: string | null;
    co2ePerUnitSnapshot: number | null;
    emissionExternalSourceKey?: string | null;
    emissionExternalRecordId?: string | null;
  };
  /** Catalog category at attach time (audit only; not stored on product row). */
  factorCategory?: string | null;
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "product",
    entityId: input.productId,
    action: "product.emission_factor.changed",
    diff: {
      versionId: input.versionId,
      productName: input.productName,
      before: input.before,
      after: input.after,
      factorCategory: input.factorCategory ?? null,
    },
  });
}
