import { Router, type IRouter } from "express";
import { db, productsTable, versionsTable, projectsTable, emissionFactorsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { newId } from "../lib/id";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router({ mergeParams: true });

async function verifyVersionAccess(versionId: string, tenantId: string) {
  const [version] = await db.select().from(versionsTable).where(eq(versionsTable.id, versionId));
  if (!version) return null;
  const [project] = await db.select().from(projectsTable)
    .where(and(eq(projectsTable.id, version.projectId), eq(projectsTable.tenantId, tenantId)));
  if (!project) return null;
  return version;
}

function calcCo2eTotal(p: typeof productsTable.$inferSelect): number | null {
  if (p.quantityValue == null || p.co2ePerUnitSnapshot == null) return null;
  return p.quantityValue * p.co2ePerUnitSnapshot;
}

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const version = await verifyVersionAccess(versionId, req.session.tenantId!);
  if (!version) { res.status(404).json({ error: "Version not found" }); return; }

  const products = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));
  res.json(products.map(p => ({ ...p, co2eTotal: calcCo2eTotal(p) })));
});

router.post("/", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const version = await verifyVersionAccess(versionId, req.session.tenantId!);
  if (!version) { res.status(404).json({ error: "Version not found" }); return; }
  if (version.status === "locked") { res.status(400).json({ error: "Version is locked" }); return; }

  const { name, category, quantityValue, quantityUnit } = req.body;
  const [product] = await db.insert(productsTable).values({
    id: newId(),
    versionId,
    name: name ?? "New Product",
    category: category ?? "other",
    quantityValue: quantityValue ?? null,
    quantityUnit: quantityUnit ?? null,
  }).returning();

  res.status(201).json({ ...product, co2eTotal: calcCo2eTotal(product) });
});

const productRouter: IRouter = Router();

productRouter.patch("/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }

  const version = await verifyVersionAccess(existing.versionId, req.session.tenantId!);
  if (!version) { res.status(404).json({ error: "Product not found" }); return; }
  if (version.status === "locked") { res.status(400).json({ error: "Version is locked" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const fields = ["name", "category", "quantityValue", "quantityUnit", "moduleA1A3Share", "moduleA4Share", "moduleA5Share", "moduleBShare", "moduleCShare"];
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }

  if (req.body["emissionFactorId"] !== undefined) {
    const factorId = req.body["emissionFactorId"];
    if (factorId) {
      const [factor] = await db.select().from(emissionFactorsTable).where(eq(emissionFactorsTable.id, factorId));
      if (factor) {
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
  res.json({ ...product, co2eTotal: calcCo2eTotal(product) });
});

productRouter.delete("/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }

  const version = await verifyVersionAccess(existing.versionId, req.session.tenantId!);
  if (!version) { res.status(404).json({ error: "Product not found" }); return; }
  if (version.status === "locked") { res.status(400).json({ error: "Version is locked" }); return; }

  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.json({ message: "Deleted" });
});

productRouter.post("/:id/duplicate", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as { id: string };
  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }

  const version = await verifyVersionAccess(existing.versionId, req.session.tenantId!);
  if (!version) { res.status(404).json({ error: "Product not found" }); return; }
  if (version.status === "locked") { res.status(400).json({ error: "Version is locked" }); return; }

  const [dup] = await db.insert(productsTable).values({
    ...existing,
    id: newId(),
    name: existing.name + " (copy)",
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  res.status(201).json({ ...dup, co2eTotal: calcCo2eTotal(dup) });
});

export { router as versionProductsRouter, productRouter };
