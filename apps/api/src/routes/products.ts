import { Router, type IRouter } from "express";
import multer from "multer";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { newId } from "../lib/id";
import { requireAuth, requireTenantEditor } from "../middlewares/requireAuth";
import {
  draftAccessFailureBody,
  getDraftVersionForTenant,
  getVersionForTenant,
  getVersionWithProjectForTenant,
} from "../access/tenantResources";
import { productCo2eTotal } from "../domain/calculation";
import {
  parseProductCreateBody,
  parseProductPatchBody,
  PRODUCT_VALIDATION_FAILED_CODE,
} from "../domain/productInputValidation";
import type { ProductValidationFailure } from "../domain/productInputValidation";
import { parseProductImportWorkbook, PRODUCT_IMPORT_MAX_ROWS } from "../domain/productExcelImport";
import {
  auditProductCreated,
  auditProductDeleted,
  auditProductDuplicated,
  auditProductEmissionFactorChanged,
  auditProductImportBatch,
  auditProductUpdated,
} from "../services/productAudit";
import {
  emissionSnapshotFromRow,
  PRODUCT_ROW_EMISSION_KEYS,
  resolveEmissionFactorPatch,
} from "../services/productEmissionFactor";

function isProductValidationFailure(x: unknown): x is ProductValidationFailure {
  return (
    typeof x === "object" &&
    x !== null &&
    "code" in x &&
    (x as ProductValidationFailure).code === PRODUCT_VALIDATION_FAILED_CODE
  );
}

const router: IRouter = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
});

router.post("/import/preview", requireTenantEditor, upload.single("file"), async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const access = await getDraftVersionForTenant(versionId, req.session.tenantId!);
  if (!access.ok) {
    res.status(access.httpStatus).json(draftAccessFailureBody(access));
    return;
  }

  const file = req.file;
  if (!file?.buffer || file.buffer.length === 0) {
    res.status(400).json({ error: "No file uploaded (expected multipart field \"file\")" });
    return;
  }

  const name = file.originalname?.toLowerCase() ?? "";
  if (!name.endsWith(".xlsx")) {
    res.status(400).json({ error: "Only .xlsx files are supported" });
    return;
  }

  try {
    const preview = await parseProductImportWorkbook(file.buffer);
    res.json(preview);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to read workbook";
    res.status(400).json({ error: msg, code: "IMPORT_PARSE_FAILED" });
  }
});

router.post("/import/commit", requireTenantEditor, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const tenantId = req.session.tenantId!;
  const access = await getDraftVersionForTenant(versionId, tenantId);
  if (!access.ok) {
    res.status(access.httpStatus).json(draftAccessFailureBody(access));
    return;
  }

  const vp = await getVersionWithProjectForTenant(versionId, tenantId);
  if (!vp) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const body = req.body as { rows?: unknown };
  if (!Array.isArray(body.rows)) {
    res.status(400).json({ error: "Request body must include \"rows\" array" });
    return;
  }
  if (body.rows.length === 0) {
    res.status(400).json({ error: "No rows to import" });
    return;
  }
  if (body.rows.length > PRODUCT_IMPORT_MAX_ROWS) {
    res.status(400).json({ error: `At most ${PRODUCT_IMPORT_MAX_ROWS} rows per import` });
    return;
  }

  const validated: ReturnType<typeof parseProductCreateBody>[] = [];
  for (let i = 0; i < body.rows.length; i++) {
    const parsed = parseProductCreateBody(body.rows[i]);
    if (isProductValidationFailure(parsed)) {
      res.status(400).json({
        error: `Row ${i + 1} failed validation`,
        code: PRODUCT_VALIDATION_FAILED_CODE,
        rowIndex: i,
        fieldErrors: parsed.fieldErrors,
      });
      return;
    }
    validated.push(parsed);
  }

  const productIds = await db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const row of validated) {
      const id = newId();
      await tx.insert(productsTable).values({
        id,
        versionId,
        name: row.name,
        category: row.category,
        quantityValue: row.quantityValue,
        quantityUnit: row.quantityUnit,
        moduleA1A3Share: row.moduleA1A3Share,
        moduleA4Share: row.moduleA4Share,
        moduleA5Share: row.moduleA5Share,
        moduleBShare: row.moduleBShare,
        moduleCShare: row.moduleCShare,
      });
      ids.push(id);
    }
    return ids;
  });

  await auditProductImportBatch({
    tenantId,
    actorUserId: req.session.userId!,
    versionId,
    projectId: vp.project.id,
    productIds,
    format: "excel",
  });

  res.status(201).json({ imported: productIds.length, productIds });
});

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const version = await getVersionForTenant(versionId, req.session.tenantId!);
  if (!version) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const products = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));
  res.json(products.map((p) => ({ ...p, co2eTotal: productCo2eTotal(p) })));
});

router.post("/", requireTenantEditor, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const access = await getDraftVersionForTenant(versionId, req.session.tenantId!);
  if (!access.ok) {
    res.status(access.httpStatus).json(draftAccessFailureBody(access));
    return;
  }

  const parsed = parseProductCreateBody(req.body);
  if (isProductValidationFailure(parsed)) {
    res.status(400).json({
      error: parsed.error,
      code: parsed.code,
      fieldErrors: parsed.fieldErrors,
    });
    return;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      id: newId(),
      versionId,
      name: parsed.name,
      category: parsed.category,
      quantityValue: parsed.quantityValue,
      quantityUnit: parsed.quantityUnit,
      moduleA1A3Share: parsed.moduleA1A3Share,
      moduleA4Share: parsed.moduleA4Share,
      moduleA5Share: parsed.moduleA5Share,
      moduleBShare: parsed.moduleBShare,
      moduleCShare: parsed.moduleCShare,
    })
    .returning();

  await auditProductCreated({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    versionId,
    productId: product.id,
    name: product.name,
  });

  res.status(201).json({ ...product, co2eTotal: productCo2eTotal(product) });
});

const productRouter: IRouter = Router();

productRouter.patch("/:id", requireTenantEditor, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const tenantId = req.session.tenantId!;
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const access = await getDraftVersionForTenant(existing.versionId, tenantId);
  if (!access.ok) {
    res.status(access.httpStatus).json(draftAccessFailureBody(access));
    return;
  }

  const partial = parseProductPatchBody(existing, req.body);
  if (isProductValidationFailure(partial)) {
    res.status(400).json({
      error: partial.error,
      code: partial.code,
      fieldErrors: partial.fieldErrors,
    });
    return;
  }

  const hasEmissionPatch = req.body["emissionFactorId"] !== undefined;
  if (Object.keys(partial.updates).length === 0 && !hasEmissionPatch) {
    res.json({ ...existing, co2eTotal: productCo2eTotal(existing) });
    return;
  }

  const updates: Record<string, unknown> = { ...partial.updates, updatedAt: new Date() };

  const beforeEmissionSnapshot = emissionSnapshotFromRow(existing);

  let emissionResolve: Awaited<ReturnType<typeof resolveEmissionFactorPatch>> | undefined;
  if (hasEmissionPatch) {
    emissionResolve = await resolveEmissionFactorPatch({
      emissionFactorId: req.body["emissionFactorId"],
      tenantId,
    });
    if (!emissionResolve.ok) {
      res.status(400).json({
        error: emissionResolve.error,
        code: emissionResolve.code,
        fieldErrors: emissionResolve.fieldErrors,
      });
      return;
    }
    Object.assign(updates, emissionResolve.updates);
  }

  const patchKeysAll = Object.keys(updates).filter((k) => k !== "updatedAt");
  const scalarPatchKeys = patchKeysAll.filter((k) => !PRODUCT_ROW_EMISSION_KEYS.includes(k as (typeof PRODUCT_ROW_EMISSION_KEYS)[number]));

  const [product] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();

  if (hasEmissionPatch) {
    await auditProductEmissionFactorChanged({
      tenantId,
      actorUserId: req.session.userId!,
      versionId: existing.versionId,
      productId: product.id,
      productName: product.name,
      before: beforeEmissionSnapshot,
      after: emissionSnapshotFromRow(product),
      factorCategory: emissionResolve?.ok && emissionResolve.factor ? emissionResolve.factor.category : null,
    });
  }

  if (scalarPatchKeys.length > 0) {
    await auditProductUpdated({
      tenantId: tenantId,
      actorUserId: req.session.userId!,
      versionId: existing.versionId,
      productId: product.id,
      name: product.name,
      patchKeys: scalarPatchKeys,
    });
  }

  res.json({ ...product, co2eTotal: productCo2eTotal(product) });
});

productRouter.delete("/:id", requireTenantEditor, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const access = await getDraftVersionForTenant(existing.versionId, req.session.tenantId!);
  if (!access.ok) {
    res.status(access.httpStatus).json(draftAccessFailureBody(access));
    return;
  }

  await auditProductDeleted({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    versionId: existing.versionId,
    productId: existing.id,
    name: existing.name,
  });

  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.json({ message: "Deleted" });
});

productRouter.post("/:id/duplicate", requireTenantEditor, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const access = await getDraftVersionForTenant(existing.versionId, req.session.tenantId!);
  if (!access.ok) {
    res.status(access.httpStatus).json(draftAccessFailureBody(access));
    return;
  }

  const [dup] = await db
    .insert(productsTable)
    .values({
      ...existing,
      id: newId(),
      name: existing.name + " (copy)",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  await auditProductDuplicated({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    versionId: existing.versionId,
    sourceProductId: existing.id,
    newProductId: dup.id,
    name: dup.name,
  });

  res.status(201).json({ ...dup, co2eTotal: productCo2eTotal(dup) });
});

export { router as versionProductsRouter, productRouter };
