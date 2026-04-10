/**
 * Api — CO₂ calculation API response (aligned with OpenAPI).
 */
import type { ModuleBreakdown } from "./moduleBreakdown";

export interface CalculationSummary {
  totalProducts: number;
  includedInCalculation: number;
  excludedIncomplete: number;
}

export interface CalculationProductLine {
  id: string;
  name: string;
  quantityValue?: number | null;
  co2ePerUnitSnapshot?: number | null;
  moduleA1A3Share: number;
  moduleA4Share: number;
  moduleA5Share: number;
  moduleBShare: number;
  moduleCShare: number;
  co2eTotal: number | null;
  eligibility: "included" | "excluded_incomplete";
  exclusionReason?: string | null;
  baseCo2e?: number | null;
}

export interface CalculationResult {
  engineVersion: string;
  computedAt: string;
  versionId: string;
  grandTotal: number;
  modules: ModuleBreakdown[];
  products: CalculationProductLine[];
  summary: CalculationSummary;
}
