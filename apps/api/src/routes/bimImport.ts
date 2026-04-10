import { Router, type IRouter } from "express";
import multer from "multer";
import { db, productsTable } from "@workspace/db";
import { newId } from "../lib/id";
import { requireTenantEditor } from "../middlewares/requireAuth";
import {
  draftAccessFailureBody,
  getDraftVersionForTenant,
  getVersionWithProjectForTenant,
} from "../access/tenantResources";
import { parseIfcBufferForPreview, BIM_IMPORT_MAX_BYTES } from "../domain/ifcImport.ts";
import {
  parseProductCreateBody,
  PRODUCT_VALIDATION_FAILED_CODE,
} from "../domain/productInputValidation.ts";
import type { ProductValidationFailure } from "../domain/productInputValidation.ts";
import { validateBuildingPayload, upsertBuildingForVersion } from "../services/buildingService.ts";
import { auditProductImportBatch } from "../services/productAudit.ts";

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
  limits: { fileSize: BIM_IMPORT_MAX_BYTES },
});

/** POST multipart field "file" — IFC STEP only. */
router.post("/preview", requireTenantEditor, upload.single("file"), async (req, res): Promise<void> => {
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
  if (!name.endsWith(".ifc")) {
    res.status(400).json({ error: "Only .ifc (IFC STEP) files are supported for BIM import" });
    return;
  }

  try {
    const preview = await parseIfcBufferForPreview(file.buffer);
    res.json(preview);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to parse IFC";
    res.status(400).json({ error: msg, code: "IFC_PARSE_FAILED" });
  }
});

type BimCommitBody = {
  applyBuilding?: unknown;
  building?: unknown;
  products?: unknown;
};

router.post("/commit", requireTenantEditor, async (req, res): Promise<void> => {
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

  const body = req.body as BimCommitBody;
  const applyBuilding = body.applyBuilding === true;
  let buildingPayload: { grossAreaM2: number; spaces: Array<{ name: string; areaM2: number }> } | null = null;

  if (applyBuilding) {
    const b = body.building;
    if (!b || typeof b !== "object" || Array.isArray(b)) {
      res.status(400).json({ error: "When applyBuilding is true, \"building\" object is required" });
      return;
    }
    const rec = b as Record<string, unknown>;
    const gross = rec["grossAreaM2"];
    const spacesRaw = rec["spaces"];
    const grossAreaM2 = gross === undefined || gross === null ? NaN : Number(gross);
    const spaces = Array.isArray(spacesRaw)
      ? spacesRaw.map((s, i) => {
          if (!s || typeof s !== "object") {
            return { name: `Space ${i + 1}`, areaM2: NaN };
          }
          const sr = s as Record<string, unknown>;
          return {
            name: typeof sr["name"] === "string" ? sr["name"] : String(sr["name"] ?? ""),
            areaM2: sr["areaM2"] === undefined || sr["areaM2"] === null ? NaN : Number(sr["areaM2"]),
          };
        })
      : [];

    buildingPayload = { grossAreaM2, spaces };
    const v = validateBuildingPayload({
      grossAreaM2: buildingPayload.grossAreaM2,
      spaces: buildingPayload.spaces,
    });
    if (!v.ok) {
      res.status(400).json({ error: v.message, code: "BUILDING_VALIDATION_FAILED" });
      return;
    }
  }

  if (!Array.isArray(body.products)) {
    res.status(400).json({ error: "Request body must include \"products\" array" });
    return;
  }
  if (body.products.length === 0 && !applyBuilding) {
    res.status(400).json({ error: "Nothing to import: enable building or provide at least one product row" });
    return;
  }

  const validated: ReturnType<typeof parseProductCreateBody>[] = [];
  for (let i = 0; i < body.products.length; i++) {
    const parsed = parseProductCreateBody(body.products[i]);
    if (isProductValidationFailure(parsed)) {
      res.status(400).json({
        error: `Product ${i + 1} failed validation`,
        code: PRODUCT_VALIDATION_FAILED_CODE,
        rowIndex: i,
        fieldErrors: parsed.fieldErrors,
      });
      return;
    }
    validated.push(parsed);
  }

  if (applyBuilding && buildingPayload) {
    const br = await upsertBuildingForVersion({
      tenantId,
      actorUserId: req.session.userId!,
      projectId: vp.project.id,
      versionId,
      body: {
        grossAreaM2: buildingPayload.grossAreaM2,
        spaces: buildingPayload.spaces,
      },
    });
    if (!br.ok) {
      res.status(br.status).json({ error: br.message, ...(br.code !== undefined ? { code: br.code } : {}) });
      return;
    }
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

  if (validated.length > 0 || applyBuilding) {
    await auditProductImportBatch({
      tenantId,
      actorUserId: req.session.userId!,
      versionId,
      projectId: vp.project.id,
      productIds,
      format: "ifc",
      buildingImported: applyBuilding,
    });
  }

  res.status(201).json({
    importedProducts: validated.length,
    productIds,
    buildingUpdated: applyBuilding,
  });
});

export { router as bimImportRouter };
