/**
 * Deterministic CO₂ breakdown from version-scoped product snapshots (no I/O).
 * Must match client-facing formulas: contribution = qty × co2ePerUnit × moduleShare.
 */

export type ProductForCalculation = {
  id: string;
  name: string;
  quantityValue: number | null;
  co2ePerUnitSnapshot: number | null;
  moduleA1A3Share: number;
  moduleA4Share: number;
  moduleA5Share: number;
  moduleBShare: number;
  moduleCShare: number;
};

const MODULE_KEYS = ["A1-A3", "A4", "A5", "B", "C"] as const;
export type LifecycleModule = (typeof MODULE_KEYS)[number];

const SHARE_FIELD: Record<LifecycleModule, keyof ProductForCalculation> = {
  "A1-A3": "moduleA1A3Share",
  A4: "moduleA4Share",
  A5: "moduleA5Share",
  B: "moduleBShare",
  C: "moduleCShare",
};

export function productCo2eTotal(
  p: Pick<ProductForCalculation, "quantityValue" | "co2ePerUnitSnapshot">,
): number | null {
  if (p.quantityValue == null || p.co2ePerUnitSnapshot == null) return null;
  return p.quantityValue * p.co2ePerUnitSnapshot;
}

export function calculateModuleBreakdown(products: ProductForCalculation[]): {
  versionId?: string;
  grandTotal: number;
  modules: Array<{
    module: LifecycleModule;
    co2eTotal: number;
    productBreakdown: Array<{ productId: string; productName: string; co2eContribution: number }>;
  }>;
  productsWithLineTotal: Array<ProductForCalculation & { co2eTotal: number | null }>;
} {
  let grandTotal = 0;
  const modules = MODULE_KEYS.map((module) => {
    let co2eTotal = 0;
    const productBreakdown = products.map((p) => {
      const base = (p.quantityValue ?? 0) * (p.co2ePerUnitSnapshot ?? 0);
      const share = (p[SHARE_FIELD[module]] as number) ?? 0;
      const contribution = base * share;
      co2eTotal += contribution;
      return { productId: p.id, productName: p.name, co2eContribution: contribution };
    });
    grandTotal += co2eTotal;
    return { module, co2eTotal, productBreakdown };
  });

  const productsWithLineTotal = products.map((p) => ({
    ...p,
    co2eTotal: productCo2eTotal(p),
  }));

  return { grandTotal, modules, productsWithLineTotal };
}
