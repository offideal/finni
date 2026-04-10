import { db, emissionFactorsTable, type EmissionFactor, type Product } from "@workspace/db";
import { eq } from "drizzle-orm";

export const EMISSION_FACTOR_INVALID_CODE = "EMISSION_FACTOR_INVALID" as const;

export function emissionFactorAllowedForTenant(
  factor: { tenantId: string | null },
  sessionTenantId: string,
): boolean {
  return factor.tenantId == null || factor.tenantId === sessionTenantId;
}

export type EmissionSnapshot = {
  emissionFactorId: string | null;
  emissionSourceName: string | null;
  emissionSourceType: string | null;
  emissionUnitSnapshot: string | null;
  co2ePerUnitSnapshot: number | null;
  emissionExternalSourceKey: string | null;
  emissionExternalRecordId: string | null;
};

export function emissionSnapshotFromRow(p: Pick<Product, keyof EmissionSnapshot>): EmissionSnapshot {
  return {
    emissionFactorId: p.emissionFactorId,
    emissionSourceName: p.emissionSourceName,
    emissionSourceType: p.emissionSourceType,
    emissionUnitSnapshot: p.emissionUnitSnapshot,
    co2ePerUnitSnapshot: p.co2ePerUnitSnapshot,
    emissionExternalSourceKey: p.emissionExternalSourceKey ?? null,
    emissionExternalRecordId: p.emissionExternalRecordId ?? null,
  };
}

/** Build product row updates from catalog row (deterministic calculation inputs). */
export function snapshotFieldsFromFactor(factor: EmissionFactor): {
  emissionFactorId: string;
  emissionSourceType: string;
  emissionSourceName: string;
  emissionUnitSnapshot: string;
  co2ePerUnitSnapshot: number;
  emissionExternalSourceKey: string | null;
  emissionExternalRecordId: string | null;
} {
  return {
    emissionFactorId: factor.id,
    emissionSourceType: factor.sourceType,
    emissionSourceName: factor.sourceName,
    emissionUnitSnapshot: factor.unit,
    co2ePerUnitSnapshot: factor.co2ePerUnit,
    emissionExternalSourceKey: factor.externalSourceKey ?? null,
    emissionExternalRecordId: factor.externalRecordId ?? null,
  };
}

export type ResolveEmissionPatchResult =
  | {
      ok: true;
      updates: Record<string, unknown>;
      factor: EmissionFactor | null;
    }
  | {
      ok: false;
      error: string;
      code: typeof EMISSION_FACTOR_INVALID_CODE;
      fieldErrors: Record<string, string>;
    };

/**
 * Resolve PATCH `emissionFactorId`: attach snapshot fields, clear, or reject invalid id / tenant / inactive.
 */
export async function resolveEmissionFactorPatch(input: {
  emissionFactorId: unknown;
  tenantId: string;
}): Promise<ResolveEmissionPatchResult> {
  const raw = input.emissionFactorId;

  if (raw === null) {
    return { ok: true, updates: clearEmissionSnapshotUpdates(), factor: null };
  }

  if (raw === undefined) {
    return {
      ok: false,
      error: "emissionFactorId value missing",
      code: EMISSION_FACTOR_INVALID_CODE,
      fieldErrors: { emissionFactorId: "Provide an id or null to clear" },
    };
  }

  if (raw === "" || (typeof raw === "string" && raw.trim() === "")) {
    return {
      ok: false,
      error: "Invalid emission factor id",
      code: EMISSION_FACTOR_INVALID_CODE,
      fieldErrors: { emissionFactorId: "Emission factor id cannot be empty" },
    };
  }

  const factorId = typeof raw === "string" ? raw.trim() : String(raw);

  const [factor] = await db.select().from(emissionFactorsTable).where(eq(emissionFactorsTable.id, factorId));

  if (!factor) {
    return {
      ok: false,
      error: "Emission factor not found",
      code: EMISSION_FACTOR_INVALID_CODE,
      fieldErrors: { emissionFactorId: "No emission factor exists with this id" },
    };
  }

  if (!factor.active) {
    return {
      ok: false,
      error: "Emission factor is not active",
      code: EMISSION_FACTOR_INVALID_CODE,
      fieldErrors: { emissionFactorId: "This emission factor is no longer active" },
    };
  }

  if (!emissionFactorAllowedForTenant(factor, input.tenantId)) {
    return {
      ok: false,
      error: "Emission factor is not available for this tenant",
      code: EMISSION_FACTOR_INVALID_CODE,
      fieldErrors: { emissionFactorId: "You cannot use this emission factor for your organization" },
    };
  }

  return {
    ok: true,
    updates: snapshotFieldsFromFactor(factor),
    factor,
  };
}

/** Clear all snapshot fields when detaching a factor. */
export function clearEmissionSnapshotUpdates(): Record<string, unknown> {
  return {
    emissionFactorId: null,
    emissionSourceType: null,
    emissionSourceName: null,
    emissionUnitSnapshot: null,
    co2ePerUnitSnapshot: null,
    emissionExternalSourceKey: null,
    emissionExternalRecordId: null,
  };
}

/** DB columns written when attaching/detaching a factor (for audit deduplication). */
export const PRODUCT_ROW_EMISSION_KEYS = [
  "emissionFactorId",
  "emissionSourceType",
  "emissionSourceName",
  "emissionUnitSnapshot",
  "co2ePerUnitSnapshot",
  "emissionExternalSourceKey",
  "emissionExternalRecordId",
] as const;
