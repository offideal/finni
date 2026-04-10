import type { Product } from "@workspace/db";
import { classifyProductRow } from "./calculation.ts";

type BuildingRow = { grossAreaM2: number | null } | null;
type VersionRow = { status: string; versionNumber: number };

/** Grouping for UI sections and navigation. */
export type ValidationGroup =
  | "project"
  | "building"
  | "products"
  | "calculation"
  /** Cross-row quality signals (naming, inclusion stats). */
  | "data_quality";

/**
 * Blocking (lock): `error`. Review: `warning`. Context only: `info` (never blocks lock).
 */
export type ValidationSeverity = "error" | "warning" | "info";

/**
 * Where to send the user to fix an issue (relative to /projects/:projectId/versions/:versionId).
 * Deterministic, no I/O.
 */
export type ValidationFixTarget =
  | { kind: "building" }
  | { kind: "products" }
  | { kind: "calculation" }
  | { kind: "product"; productId: string };

export type ValidationCheck = {
  id: string;
  passed: boolean;
  message: string;
  severity: ValidationSeverity;
  group: ValidationGroup;
  /** Suggested place in the workflow to resolve the issue (UI maps to routes). */
  fixTarget?: ValidationFixTarget;
};

export type ValidationSummary = {
  /** Error-severity checks that failed (block lock). */
  blockingFailed: number;
  /** Error-severity checks that passed. */
  blockingPassed: number;
  /** Warning-severity checks that failed. */
  warningFailed: number;
  /** Warning-severity checks that passed. */
  warningPassed: number;
  /** Informational checks that failed (never block lock). */
  infoFailed: number;
  /** Informational checks that passed. */
  infoPassed: number;
};

export function summarizeValidationChecks(checks: ValidationCheck[]): ValidationSummary {
  const errors = checks.filter((c) => c.severity === "error");
  const warnings = checks.filter((c) => c.severity === "warning");
  const infos = checks.filter((c) => c.severity === "info");
  return {
    blockingFailed: errors.filter((c) => !c.passed).length,
    blockingPassed: errors.filter((c) => c.passed).length,
    warningFailed: warnings.filter((c) => !c.passed).length,
    warningPassed: warnings.filter((c) => c.passed).length,
    infoFailed: infos.filter((c) => !c.passed).length,
    infoPassed: infos.filter((c) => c.passed).length,
  };
}

/** Deterministic duplicate detection: normalized product names appearing more than once. */
export function duplicateProductNameKeys(products: Product[]): string[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    const k = p.name.trim().toLowerCase();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

export type VersionValidationInput = {
  version: VersionRow;
  building: BuildingRow;
  products: Product[];
  /** When set, enables contextual informational rules. */
  project?: { id: string; name: string } | null;
};

export function buildVersionValidationChecks(input: VersionValidationInput): ValidationCheck[] {
  const { version, building, products, project } = input;
  const checks: ValidationCheck[] = [];

  checks.push({
    id: "project_exists",
    passed: true,
    message: "Project and version are accessible",
    severity: "error",
    group: "project",
  });

  checks.push({
    id: "building_gross_area",
    passed: !!(building && building.grossAreaM2 && building.grossAreaM2 > 0),
    message: "Building gross area is set and greater than zero",
    severity: "error",
    group: "building",
    fixTarget: { kind: "building" },
  });

  if (products.length === 0) {
    checks.push({
      id: "has_products",
      passed: false,
      message: "At least one product row is required",
      severity: "error",
      group: "products",
      fixTarget: { kind: "products" },
    });
  } else {
    checks.push({
      id: "has_products",
      passed: true,
      message: "Version has at least one product row",
      severity: "error",
      group: "products",
      fixTarget: { kind: "products" },
    });

    for (const p of products) {
      checks.push({
        id: `product_name_${p.id}`,
        passed: !!(p.name && p.name.trim()),
        message: `Product "${p.name || "(unnamed)"}" has a name`,
        severity: "error",
        group: "products",
        fixTarget: { kind: "product", productId: p.id },
      });
      checks.push({
        id: `product_category_${p.id}`,
        passed: !!(p.category && p.category.trim()),
        message: `Product "${p.name}" has a category`,
        severity: "error",
        group: "products",
        fixTarget: { kind: "product", productId: p.id },
      });
      checks.push({
        id: `product_quantity_${p.id}`,
        passed: !!(p.quantityValue && p.quantityValue > 0),
        message: `Product "${p.name}" has quantity greater than zero`,
        severity: "error",
        group: "products",
        fixTarget: { kind: "product", productId: p.id },
      });
      checks.push({
        id: `product_unit_${p.id}`,
        passed: !!p.quantityUnit,
        message: `Product "${p.name}" has a quantity unit`,
        severity: "error",
        group: "products",
        fixTarget: { kind: "product", productId: p.id },
      });
      checks.push({
        id: `product_factor_${p.id}`,
        passed: !!(p.emissionFactorId && p.co2ePerUnitSnapshot != null),
        message: `Product "${p.name}" has an emission factor attached`,
        severity: "error",
        group: "products",
        fixTarget: { kind: "product", productId: p.id },
      });
      if (p.quantityUnit && p.emissionUnitSnapshot) {
        checks.push({
          id: `product_unit_match_${p.id}`,
          passed: assertProductEmissionUnitMatch(p),
          message: `Product "${p.name}" quantity unit matches emission factor unit`,
          severity: "error",
          group: "products",
          fixTarget: { kind: "product", productId: p.id },
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
        group: "calculation",
        fixTarget: { kind: "calculation" },
      });

      const snap = p.co2ePerUnitSnapshot;
      if (snap != null) {
        const ok = Number.isFinite(snap) && snap >= 0;
        checks.push({
          id: `product_co2e_snapshot_valid_${p.id}`,
          passed: ok,
          message: ok
            ? `Product "${p.name}" has a valid non-negative CO₂e per unit snapshot`
            : `Product "${p.name}" has an invalid CO₂e per unit snapshot (must be finite and ≥ 0)`,
          severity: "error",
          group: "products",
          fixTarget: { kind: "product", productId: p.id },
        });
      }
    }
  }

  if (products.length > 0) {
    const dups = duplicateProductNameKeys(products);
    checks.push({
      id: "data_quality_duplicate_product_names",
      passed: dups.length === 0,
      message:
        dups.length === 0
          ? "No duplicate product names (case-insensitive) within this version"
          : `Duplicate product names (${dups.length}): ${dups.slice(0, 8).join(", ")}${dups.length > 8 ? "…" : ""}`,
      severity: "warning",
      group: "data_quality",
      fixTarget: { kind: "products" },
    });

    const area = building?.grossAreaM2;
    if (area != null && Number.isFinite(area) && area > 100_000) {
      checks.push({
        id: "building_gross_area_sanity",
        passed: false,
        message: `Building gross area is very large (${area.toLocaleString()} m²) — confirm the value is intentional`,
        severity: "warning",
        group: "building",
        fixTarget: { kind: "building" },
      });
    }
  }

  if (version.status === "locked") {
    checks.push({
      id: "version_locked",
      passed: false,
      message: "Version is locked (read-only for data entry)",
      severity: "warning",
      group: "project",
    });
  }

  const projectLabel = project?.name?.trim() || "this project";
  checks.push({
    id: "scope_project_context",
    passed: true,
    message: `Validation scope: project "${projectLabel}", version v${version.versionNumber}`,
    severity: "info",
    group: "project",
  });

  let included = 0;
  for (const p of products) {
    if (classifyProductRow(p).eligibility === "included") included += 1;
  }
  checks.push({
    id: "data_quality_calculation_inclusion",
    passed: true,
    message: `${included} of ${products.length} product row(s) are fully quantified for CO₂ calculation`,
    severity: "info",
    group: "data_quality",
  });

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

export function validateVersionForApproval(input: VersionValidationInput): { passed: boolean; checks: ValidationCheck[] } {
  const checks = buildVersionValidationChecks(input);
  return { passed: validationPassed(checks), checks };
}
