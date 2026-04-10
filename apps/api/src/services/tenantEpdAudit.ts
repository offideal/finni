import { writeAuditLog } from "./auditService.ts";

export async function auditTenantEpdCreated(input: {
  tenantId: string;
  actorUserId: string;
  factorId: string;
  snapshot: {
    sourceName: string;
    category: string;
    unit: string;
    co2ePerUnit: number;
  };
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "emission_factor",
    entityId: input.factorId,
    action: "tenant_epd.created",
    diff: { ...input.snapshot },
  });
}

export async function auditTenantEpdUpdated(input: {
  tenantId: string;
  actorUserId: string;
  factorId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "emission_factor",
    entityId: input.factorId,
    action: "tenant_epd.updated",
    diff: { before: input.before, after: input.after },
  });
}

export async function auditTenantEpdArchived(input: {
  tenantId: string;
  actorUserId: string;
  factorId: string;
  sourceName: string;
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "emission_factor",
    entityId: input.factorId,
    action: "tenant_epd.archived",
    diff: { sourceName: input.sourceName, active: false },
  });
}
