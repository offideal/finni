/**
 * CO₂e calculation engine (pure, no I/O).
 *
 * Formula per module: contribution = baseCo2e × moduleShare
 * where baseCo2e = quantity × co2ePerUnitSnapshot when the row is numerically complete; otherwise 0.
 *
 * grandTotal = Σ_module Σ_product contribution (equivalently Σ_product baseCo2e × Σ_module share = Σ_product baseCo2e when shares sum to 1).
 */

export const CO2_ENGINE_VERSION = "1.0.0" as const;

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

export type RowEligibility = "included" | "excluded_incomplete";

/** Deterministic classification: only finite quantity + factor participate in module math. */
export function classifyProductRow(
  p: Pick<ProductForCalculation, "quantityValue" | "co2ePerUnitSnapshot">,
): { eligibility: RowEligibility; exclusionReason?: string } {
  if (p.quantityValue == null || p.co2ePerUnitSnapshot == null) {
    return {
      eligibility: "excluded_incomplete",
      exclusionReason: "Missing quantity or emission factor snapshot",
    };
  }
  if (!Number.isFinite(p.quantityValue) || !Number.isFinite(p.co2ePerUnitSnapshot)) {
    return {
      eligibility: "excluded_incomplete",
      exclusionReason: "Non-finite quantity or emission factor snapshot",
    };
  }
  if (p.quantityValue < 0) {
    return { eligibility: "excluded_incomplete", exclusionReason: "Negative quantity is not used in calculation" };
  }
  return { eligibility: "included" };
}

/** baseCo2e = qty × factor; 0 when row does not contribute. */
export function lineBaseCo2e(p: ProductForCalculation): number {
  const c = classifyProductRow(p);
  if (c.eligibility !== "included") return 0;
  return p.quantityValue! * p.co2ePerUnitSnapshot!;
}

function finiteShare(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v;
}

export function productCo2eTotal(
  p: Pick<ProductForCalculation, "quantityValue" | "co2ePerUnitSnapshot">,
): number | null {
  const c = classifyProductRow(p);
  if (c.eligibility !== "included") return null;
  return p.quantityValue! * p.co2ePerUnitSnapshot!;
}

/** Single module contribution (deterministic). */
export function moduleContribution(p: ProductForCalculation, module: LifecycleModule): number {
  const base = lineBaseCo2e(p);
  const share = finiteShare(p[SHARE_FIELD[module]] as number);
  return base * share;
}

export function calculateModuleBreakdown(productsInput: ProductForCalculation[]): {
  grandTotal: number;
  modules: Array<{
    module: LifecycleModule;
    co2eTotal: number;
    productBreakdown: Array<{ productId: string; productName: string; co2eContribution: number }>;
  }>;
  productsWithLineTotal: Array<ProductForCalculation & { co2eTotal: number | null }>;
} {
  const products = sortProductsById(productsInput);

  let grandTotal = 0;
  const modules = MODULE_KEYS.map((module) => {
    let co2eTotal = 0;
    const productBreakdown = products.map((p) => {
      const contribution = moduleContribution(p, module);
      co2eTotal += contribution;
      return { productId: p.id, productName: p.name, co2eContribution: contribution };
    });
    grandTotal += co2eTotal;
    return {
      module,
      co2eTotal,
      productBreakdown: sortBreakdownByProductId(productBreakdown),
    };
  });

  const productsWithLineTotal = products.map((p) => ({
    ...p,
    co2eTotal: productCo2eTotal(p),
  }));

  return { grandTotal, modules, productsWithLineTotal };
}

function sortProductsById(products: ProductForCalculation[]): ProductForCalculation[] {
  return [...products].sort((a, b) => a.id.localeCompare(b.id));
}

function sortBreakdownByProductId<T extends { productId: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.productId.localeCompare(b.productId));
}

export type CalculationProductLine = ProductForCalculation & {
  co2eTotal: number | null;
  eligibility: RowEligibility;
  exclusionReason?: string;
  /** Quantity × factor when included; null when excluded. */
  baseCo2e: number | null;
};

export type VersionCalculationPayload = {
  engineVersion: string;
  computedAt: string;
  versionId: string;
  grandTotal: number;
  modules: ReturnType<typeof calculateModuleBreakdown>["modules"];
  /** Enriched lines for UI / audit transparency */
  products: CalculationProductLine[];
  summary: {
    totalProducts: number;
    includedInCalculation: number;
    excludedIncomplete: number;
  };
};

/** Full version-scoped result: deterministic ordering and explicit incomplete-row handling. */
export function buildVersionCalculationPayload(
  versionId: string,
  productsInput: ProductForCalculation[],
  computedAtIso: string,
): VersionCalculationPayload {
  const products = sortProductsById(productsInput);
  const { grandTotal, modules, productsWithLineTotal } = calculateModuleBreakdown(products);

  const lines: CalculationProductLine[] = productsWithLineTotal.map((row) => {
    const c = classifyProductRow(row);
    const base =
      c.eligibility === "included" ? row.quantityValue! * row.co2ePerUnitSnapshot! : null;
    return {
      ...row,
      co2eTotal: row.co2eTotal,
      eligibility: c.eligibility,
      exclusionReason: c.exclusionReason,
      baseCo2e: base,
    };
  });

  const includedInCalculation = lines.filter((l) => l.eligibility === "included").length;

  return {
    engineVersion: CO2_ENGINE_VERSION,
    computedAt: computedAtIso,
    versionId,
    grandTotal,
    modules,
    products: lines,
    summary: {
      totalProducts: lines.length,
      includedInCalculation,
      excludedIncomplete: lines.length - includedInCalculation,
    },
  };
}
