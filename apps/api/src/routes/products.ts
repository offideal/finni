import { Router, type IRouter } from "express";
import { db, productsTable, emissionFactorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { newId } from "../lib/id";
import { requireAuth, requireTenantEditor } from "../middlewares/requireAuth";
import { getDraftVersionForTenant, getVersionForTenant } from "../access/tenantResources";
import { productCo2eTotal } from "../domain/calculation";

function emissionFactorAllowedForTenant(
  factor: { tenantId: string | null },
  sessionTenantId: string,
): boolean {
  return factor.tenantId == null || factor.tenantId === sessionTenantId;
}

const router: IRouter = Router({ mergeParams: true });

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
    res.status(access.httpStatus).json({ error: access.error });
    return;
  }

  const { name, category, quantityValue, quantityUnit } = req.body;
  const [product] = await db
    .insert(productsTable)
    .values({
      id: newId(),
      versionId,
      name: name ?? "New Product",
      category: category ?? "other",
      quantityValue: quantityValue ?? null,
      quantityUnit: quantityUnit ?? null,
    })
    .returning();

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
    res.status(access.httpStatus).json({ error: access.error });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const fields = [
    "name",
    "category",
    "quantityValue",
    "quantityUnit",
    "moduleA1A3Share",
    "moduleA4Share",
    "moduleA5Share",
    "moduleBShare",
    "moduleCShare",
  ];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  if (req.body["emissionFactorId"] !== undefined) {
    const factorId = req.body["emissionFactorId"];
    if (factorId) {
      const [factor] = await db.select().from(emissionFactorsTable).where(eq(emissionFactorsTable.id, factorId));
      if (factor && emissionFactorAllowedForTenant(factor, tenantId)) {
        updates["emissionFactorId"] = factor.id;
        updates["emissionSourceType"] = factor.sourceType;
        updates["emissionSourceName"] = factor.sourceName;
        updates["emissionUnitSnapshot"] = factor.unit;
        updates["co2ePerUnitSnapshot"] = factor.co2ePerUnit;
      }
    } else {
      updates["emissionFactorId"] = null;
      updates["emissionSourceType"] = null;
      updates["emissionSourceName"] = null;
      updates["emissionUnitSnapshot"] = null;
      updates["co2ePerUnitSnapshot"] = null;
    }
  }

  const [product] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
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
    res.status(access.httpStatus).json({ error: access.error });
    return;
  }

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
    res.status(access.httpStatus).json({ error: access.error });
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

  res.status(201).json({ ...dup, co2eTotal: productCo2eTotal(dup) });
});

export { router as versionProductsRouter, productRouter };
