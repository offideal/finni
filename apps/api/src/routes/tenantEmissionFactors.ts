import { Router, type IRouter } from "express";
import { db, emissionFactorsTable } from "@workspace/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { requireAuth, requireTenantEpdManager } from "../middlewares/requireAuth";
import { newId } from "../lib/id";
import {
  parseTenantEpdCreateBody,
  parseTenantEpdUpdateBody,
  TENANT_EPD_VALIDATION_FAILED,
} from "../domain/tenantEpdValidation.ts";
import type { TenantEpdValidationFailure } from "../domain/tenantEpdValidation.ts";
import { auditTenantEpdArchived, auditTenantEpdCreated, auditTenantEpdUpdated } from "../services/tenantEpdAudit.ts";

function isTenantEpdFailure(x: unknown): x is TenantEpdValidationFailure {
  return (
    typeof x === "object" &&
    x !== null &&
    "code" in x &&
    (x as TenantEpdValidationFailure).code === TENANT_EPD_VALIDATION_FAILED
  );
}

const router: IRouter = Router();

/** All tenant-owned factors (active + archived) for management UI. */
router.get("/managed", requireAuth, requireTenantEpdManager, async (req, res): Promise<void> => {
  const tenantId = req.session.tenantId!;
  const rows = await db
    .select()
    .from(emissionFactorsTable)
    .where(
      and(
        eq(emissionFactorsTable.tenantId, tenantId),
        eq(emissionFactorsTable.sourceType, "EPD"),
        isNull(emissionFactorsTable.externalSourceKey),
      ),
    )
    .orderBy(asc(emissionFactorsTable.sourceName));
  res.json(rows);
});

router.post("/", requireAuth, requireTenantEpdManager, async (req, res): Promise<void> => {
  const tenantId = req.session.tenantId!;
  const parsed = parseTenantEpdCreateBody(req.body);
  if (isTenantEpdFailure(parsed)) {
    res.status(400).json({
      error: parsed.error,
      code: parsed.code,
      fieldErrors: parsed.fieldErrors,
    });
    return;
  }

  const id = newId();
  const [row] = await db
    .insert(emissionFactorsTable)
    .values({
      id,
      tenantId,
      sourceType: "EPD",
      sourceName: parsed.sourceName,
      category: parsed.category,
      unit: parsed.unit,
      co2ePerUnit: parsed.co2ePerUnit,
      active: true,
      externalSourceKey: null,
      externalRecordId: null,
      lastSyncedAt: null,
    })
    .returning();

  await auditTenantEpdCreated({
    tenantId,
    actorUserId: req.session.userId!,
    factorId: row.id,
    snapshot: {
      sourceName: row.sourceName,
      category: row.category,
      unit: row.unit,
      co2ePerUnit: row.co2ePerUnit,
    },
  });

  res.status(201).json(row);
});

router.patch("/:id", requireAuth, requireTenantEpdManager, async (req, res): Promise<void> => {
  const tenantId = req.session.tenantId!;
  const { id } = req.params as { id: string };

  const [existing] = await db
    .select()
    .from(emissionFactorsTable)
    .where(
      and(
        eq(emissionFactorsTable.id, id),
        eq(emissionFactorsTable.tenantId, tenantId),
        eq(emissionFactorsTable.sourceType, "EPD"),
        isNull(emissionFactorsTable.externalSourceKey),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "EPD record not found" });
    return;
  }

  const parsed = parseTenantEpdUpdateBody(req.body);
  if (isTenantEpdFailure(parsed)) {
    res.status(400).json({
      error: parsed.error,
      code: parsed.code,
      fieldErrors: parsed.fieldErrors,
    });
    return;
  }

  const before = {
    sourceName: existing.sourceName,
    category: existing.category,
    unit: existing.unit,
    co2ePerUnit: existing.co2ePerUnit,
  };

  const [updated] = await db
    .update(emissionFactorsTable)
    .set({
      ...parsed,
    })
    .where(
      and(
        eq(emissionFactorsTable.id, id),
        eq(emissionFactorsTable.tenantId, tenantId),
        eq(emissionFactorsTable.sourceType, "EPD"),
        isNull(emissionFactorsTable.externalSourceKey),
      ),
    )
    .returning();

  await auditTenantEpdUpdated({
    tenantId,
    actorUserId: req.session.userId!,
    factorId: id,
    before,
    after: {
      sourceName: updated.sourceName,
      category: updated.category,
      unit: updated.unit,
      co2ePerUnit: updated.co2ePerUnit,
    },
  });

  res.json(updated);
});

router.post("/:id/archive", requireAuth, requireTenantEpdManager, async (req, res): Promise<void> => {
  const tenantId = req.session.tenantId!;
  const { id } = req.params as { id: string };

  const [existing] = await db
    .select()
    .from(emissionFactorsTable)
    .where(
      and(
        eq(emissionFactorsTable.id, id),
        eq(emissionFactorsTable.tenantId, tenantId),
        eq(emissionFactorsTable.sourceType, "EPD"),
        isNull(emissionFactorsTable.externalSourceKey),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "EPD record not found" });
    return;
  }

  if (!existing.active) {
    res.status(400).json({ error: "Already archived", code: "ALREADY_ARCHIVED" });
    return;
  }

  const [row] = await db
    .update(emissionFactorsTable)
    .set({ active: false })
    .where(
      and(
        eq(emissionFactorsTable.id, id),
        eq(emissionFactorsTable.tenantId, tenantId),
        eq(emissionFactorsTable.sourceType, "EPD"),
        isNull(emissionFactorsTable.externalSourceKey),
      ),
    )
    .returning();

  await auditTenantEpdArchived({
    tenantId,
    actorUserId: req.session.userId!,
    factorId: id,
    sourceName: existing.sourceName,
  });

  res.json(row);
});

export default router;
