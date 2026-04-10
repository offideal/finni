import { db, auditLogsTable } from "@workspace/db";
import { newId } from "../lib/id";

/**
 * Append-only audit insert. Application code must not update or delete rows
 * (retention / admin tooling may bypass via DB outside the product API).
 */
export async function writeAuditLog(input: {
  tenantId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  diff?: unknown;
}): Promise<void> {
  await db.insert(auditLogsTable).values({
    id: newId(),
    tenantId: input.tenantId,
    userId: input.actorUserId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    diffJson: input.diff != null ? JSON.stringify(input.diff) : null,
  });
}
