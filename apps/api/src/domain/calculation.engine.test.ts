import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CO2_ENGINE_VERSION,
  buildVersionCalculationPayload,
  calculateModuleBreakdown,
  classifyProductRow,
  lineBaseCo2e,
  moduleContribution,
  type ProductForCalculation,
} from "./calculation.ts";

function sampleProduct(overrides: Partial<ProductForCalculation> = {}): ProductForCalculation {
  return {
    id: "p1",
    name: "Test",
    quantityValue: 10,
    co2ePerUnitSnapshot: 2,
    moduleA1A3Share: 1,
    moduleA4Share: 0,
    moduleA5Share: 0,
    moduleBShare: 0,
    moduleCShare: 0,
    ...overrides,
  };
}

describe("classifyProductRow", () => {
  it("includes finite quantity and factor", () => {
    const r = classifyProductRow({ quantityValue: 1, co2ePerUnitSnapshot: 3 });
    assert.equal(r.eligibility, "included");
  });

  it("excludes null quantity", () => {
    const r = classifyProductRow({ quantityValue: null, co2ePerUnitSnapshot: 3 });
    assert.equal(r.eligibility, "excluded_incomplete");
  });

  it("excludes negative quantity", () => {
    const r = classifyProductRow({ quantityValue: -1, co2ePerUnitSnapshot: 3 });
    assert.equal(r.eligibility, "excluded_incomplete");
  });
});

describe("lineBaseCo2e and moduleContribution", () => {
  it("computes base as qty × factor", () => {
    const p = sampleProduct({ quantityValue: 5, co2ePerUnitSnapshot: 4 });
    assert.equal(lineBaseCo2e(p), 20);
  });

  it("returns 0 for incomplete row", () => {
    const p = sampleProduct({ quantityValue: null, co2ePerUnitSnapshot: 4 });
    assert.equal(lineBaseCo2e(p), 0);
  });

  it("splits across modules (deterministic)", () => {
    const p = sampleProduct({
      quantityValue: 100,
      co2ePerUnitSnapshot: 1,
      moduleA1A3Share: 0.5,
      moduleA4Share: 0.5,
      moduleA5Share: 0,
      moduleBShare: 0,
      moduleCShare: 0,
    });
    assert.equal(moduleContribution(p, "A1-A3"), 50);
    assert.equal(moduleContribution(p, "A4"), 50);
    assert.equal(moduleContribution(p, "A5"), 0);
  });
});

describe("calculateModuleBreakdown", () => {
  it("grand total equals sum of module totals", () => {
    const p = sampleProduct();
    const { grandTotal, modules } = calculateModuleBreakdown([p]);
    const sumMod = modules.reduce((s, m) => s + m.co2eTotal, 0);
    assert.equal(grandTotal, sumMod);
    assert.equal(grandTotal, 20);
  });

  it("is deterministic on product order (sorted by id)", () => {
    const a = sampleProduct({ id: "b", name: "B" });
    const b = sampleProduct({ id: "a", name: "A" });
    const r1 = calculateModuleBreakdown([a, b]);
    const r2 = calculateModuleBreakdown([b, a]);
    assert.equal(r1.grandTotal, r2.grandTotal);
    assert.deepEqual(
      r1.modules[0]!.productBreakdown.map((x) => x.productId),
      ["a", "b"],
    );
  });
});

describe("buildVersionCalculationPayload", () => {
  it("same inputs produce same outputs (determinism)", () => {
    const rows = [sampleProduct({ id: "a" }), sampleProduct({ id: "b", name: "X", quantityValue: 1 })];
    const t = "2026-01-01T00:00:00.000Z";
    const r1 = buildVersionCalculationPayload("v1", rows, t);
    const r2 = buildVersionCalculationPayload("v1", [...rows].reverse(), t);
    assert.equal(r1.grandTotal, r2.grandTotal);
    assert.deepEqual(r1.modules, r2.modules);
    assert.equal(r1.engineVersion, CO2_ENGINE_VERSION);
  });

  it("counts excluded incomplete rows", () => {
    const rows = [
      sampleProduct({ id: "x", quantityValue: null, co2ePerUnitSnapshot: 1 }),
      sampleProduct({ id: "y", quantityValue: 2, co2ePerUnitSnapshot: 3 }),
    ];
    const r = buildVersionCalculationPayload("v1", rows, "2026-01-01T00:00:00.000Z");
    assert.equal(r.summary.excludedIncomplete, 1);
    assert.equal(r.summary.includedInCalculation, 1);
    assert.equal(r.products.find((p) => p.id === "x")!.eligibility, "excluded_incomplete");
  });
});
