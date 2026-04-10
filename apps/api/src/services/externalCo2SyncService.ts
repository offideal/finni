import { createHash } from "node:crypto";
import { db, emissionFactorsTable, externalCo2SourcesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getExternalCo2Handler } from "../domain/externalCo2/registry.ts";
import { writeAuditLog } from "./auditService.ts";

/** Deterministic emission_factors.id for a tenant + external lineage (stable across syncs). */
export function stableExternalEmissionFactorId(
  tenantId: string,
  externalSourceKey: string,
  externalRecordId: string,
): string {
  const h = createHash("sha256")
    .update(`${tenantId}\0${externalSourceKey}\0${externalRecordId}`)
    .digest("hex");
  return `ext_${h.slice(0, 26)}`;
}

export type SyncExternalCo2SourceResult =
  | { ok: true; upserted: number; sourceKey: string }
  | { ok: false; error: string; code: "NOT_FOUND" | "DISABLED" | "NO_HANDLER" | "SYNC_FAILED" };

/**
 * Materializes external records into tenant-scoped catalog rows. Calculation still uses product snapshots only;
 * this updates what users can pick next, not historical version rows.
 */
export async function syncExternalCo2SourceForTenant(input: {
  tenantId: string;
  sourceKey: string;
  actorUserId: string;
}): Promise<SyncExternalCo2SourceResult> {
  const [src] = await db
    .select()
    .from(externalCo2SourcesTable)
    .where(eq(externalCo2SourcesTable.key, input.sourceKey));

  if (!src) {
    return { ok: false, error: "Unknown external source", code: "NOT_FOUND" };
  }
  if (!src.enabled) {
    return { ok: false, error: "This external source is disabled", code: "DISABLED" };
  }

  const handler = getExternalCo2Handler(input.sourceKey);
  if (!handler) {
    return { ok: false, error: "No sync implementation registered for this source", code: "NO_HANDLER" };
  }

  let records;
  try {
    records = await handler.fetchRecordsForSync();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return { ok: false, error: msg, code: "SYNC_FAILED" };
  }

  const now = new Date();
  let upserted = 0;

  for (const r of records) {
    const id = stableExternalEmissionFactorId(input.tenantId, handler.key, r.externalRecordId);
    const [existing] = await db.select().from(emissionFactorsTable).where(eq(emissionFactorsTable.id, id));

    const row = {
      id,
      tenantId: input.tenantId,
      sourceType: "external",
      sourceName: r.sourceName,
      category: r.category,
      unit: r.unit,
      co2ePerUnit: r.co2ePerUnit,
      active: true,
      externalSourceKey: handler.key,
      externalRecordId: r.externalRecordId,
      lastSyncedAt: now,
    };

    if (existing) {
      await db
        .update(emissionFactorsTable)
        .set({
          sourceName: row.sourceName,
          category: row.category,
          unit: row.unit,
          co2ePerUnit: row.co2ePerUnit,
          active: true,
          externalSourceKey: row.externalSourceKey,
          externalRecordId: row.externalRecordId,
          lastSyncedAt: row.lastSyncedAt,
        })
        .where(eq(emissionFactorsTable.id, id));
    } else {
      await db.insert(emissionFactorsTable).values(row);
    }
    upserted += 1;
  }

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "external_co2_source",
    entityId: input.sourceKey,
    action: "external_co2.synced",
    diff: {
      sourceKey: input.sourceKey,
      upserted,
      recordIds: records.map((x) => x.externalRecordId),
    },
  });

  return { ok: true, upserted, sourceKey: input.sourceKey };
}

export async function listExternalCo2SourcesForTenant(_tenantId: string) {
  const rows = await db.select().from(externalCo2SourcesTable).where(eq(externalCo2SourcesTable.enabled, true));

  return rows.map((r) => {
    const handler = getExternalCo2Handler(r.key);
    return {
      id: r.id,
      key: r.key,
      displayName: r.displayName,
      description: r.description,
      hasHandler: handler != null,
    };
  });
}
