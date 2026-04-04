import type { Product } from "@workspace/db";

type BuildingRow = { grossAreaM2: number | null } | null;
type VersionRow = { status: string };

export type ValidationCheck = {
  id: string;
  passed: boolean;
  message: string;
  severity: "error" | "warning";
};

export function buildVersionValidationChecks(input: {
  version: VersionRow;
  building: BuildingRow;
  products: Product[];
}): ValidationCheck[] {
  const { version, building, products } = input;
  const checks: ValidationCheck[] = [];

  checks.push({ id: "project_exists", passed: true, message: "Project exists", severity: "error" });

  checks.push({
    id: "building_gross_area",
    passed: !!(building && building.grossAreaM2 && building.grossAreaM2 > 0),
    message: "Building gross area is set",
    severity: "error",
  });

  if (products.length === 0) {
    checks.push({
      id: "has_products",
      passed: false,
      message: "At least one product is required",
      severity: "error",
    });
  } else {
    checks.push({ id: "has_products", passed: true, message: "Version has products", severity: "error" });

    for (const p of products) {
      checks.push({
        id: `product_name_${p.id}`,
        passed: !!(p.name && p.name.trim()),
        message: `Product "${p.name || "(unnamed)"}" has a name`,
        severity: "error",
      });
      checks.push({
        id: `product_category_${p.id}`,
        passed: !!(p.category && p.category.trim()),
        message: `Product "${p.name}" has a category`,
        severity: "error",
      });
      checks.push({
        id: `product_quantity_${p.id}`,
        passed: !!(p.quantityValue && p.quantityValue > 0),
        message: `Product "${p.name}" has quantity value > 0`,
        severity: "error",
      });
      checks.push({
        id: `product_unit_${p.id}`,
        passed: !!p.quantityUnit,
        message: `Product "${p.name}" has quantity unit`,
        severity: "error",
      });
      checks.push({
        id: `product_factor_${p.id}`,
        passed: !!(p.emissionFactorId && p.co2ePerUnitSnapshot != null),
        message: `Product "${p.name}" has emission factor attached`,
        severity: "error",
      });
      if (p.quantityUnit && p.emissionUnitSnapshot) {
        checks.push({
          id: `product_unit_match_${p.id}`,
          passed: assertProductEmissionUnitMatch(p),
          message: `Product "${p.name}" unit matches emission factor unit`,
          severity: "error",
        });
      }
      const shareSum =
        (p.moduleA1A3Share ?? 0) +
        (p.moduleA4Share ?? 0) +
        (p.moduleA5Share ?? 0) +
        (p.moduleBShare ?? 0) +
        (p.moduleCShare ?? 0);
      checks.push({
        id: `product_shares_${p.id}`,
        passed: Math.abs(shareSum - 1.0) < 0.001,
        message: `Product "${p.name}" module shares sum to 1.0 (currently ${shareSum.toFixed(3)})`,
        severity: "error",
      });
    }
  }

  if (version.status === "locked") {
    checks.push({
      id: "version_locked",
      passed: false,
      message: "Version is locked and cannot be edited",
      severity: "warning",
    });
  }

  return checks;
}

export function validationPassed(checks: ValidationCheck[]): boolean {
  return checks.filter((c) => c.severity === "error").every((c) => c.passed);
}

/** True if quantity unit matches snapshot when both are set. */
export function assertProductEmissionUnitMatch(p: Product): boolean {
  if (!p.quantityUnit || !p.emissionUnitSnapshot) return true;
  return p.quantityUnit === p.emissionUnitSnapshot;
}

export function validateVersionForApproval(input: {
  version: VersionRow;
  building: BuildingRow;
  products: Product[];
}): { passed: boolean; checks: ValidationCheck[] } {
  const checks = buildVersionValidationChecks(input);
  return { passed: validationPassed(checks), checks };
}
