import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVersionValidationChecks,
  duplicateProductNameKeys,
  summarizeValidationChecks,
  validationPassed,
} from "./validationChecks.ts";

test("summarizeValidationCounts three severities", () => {
  const summary = summarizeValidationChecks([
    { id: "a", passed: false, message: "x", severity: "error", group: "project" },
    { id: "b", passed: true, message: "x", severity: "error", group: "project" },
    { id: "c", passed: false, message: "x", severity: "warning", group: "building" },
    { id: "d", passed: true, message: "x", severity: "warning", group: "building" },
    { id: "e", passed: true, message: "x", severity: "info", group: "data_quality" },
  ]);
  assert.equal(summary.blockingFailed, 1);
  assert.equal(summary.blockingPassed, 1);
  assert.equal(summary.warningFailed, 1);
  assert.equal(summary.warningPassed, 1);
  assert.equal(summary.infoFailed, 0);
  assert.equal(summary.infoPassed, 1);
});

test("duplicateProductNameKeys is case-insensitive", () => {
  const keys = duplicateProductNameKeys([
    { name: "Beam", id: "1" } as never,
    { name: "beam", id: "2" } as never,
    { name: "Slab", id: "3" } as never,
  ]);
  assert.deepEqual(keys, ["beam"]);
});

test("validationPassed ignores warnings and info", () => {
  const checks = buildVersionValidationChecks({
    version: { status: "draft", versionNumber: 1 },
    building: { grossAreaM2: 100 },
    products: [],
    project: { id: "p1", name: "Test" },
  });
  assert.equal(validationPassed(checks), false);
  const onlyInfo = checks.filter((c) => c.severity === "info");
  assert.ok(onlyInfo.length >= 1);
});

test("co2e snapshot must be non-negative when present", () => {
  const checks = buildVersionValidationChecks({
    version: { status: "draft", versionNumber: 1 },
    building: { grossAreaM2: 10 },
    products: [
      {
        id: "x",
        name: "A",
        category: "other",
        quantityValue: 1,
        quantityUnit: "kg",
        emissionFactorId: "ef",
        co2ePerUnitSnapshot: -1,
        moduleA1A3Share: 1,
        moduleA4Share: 0,
        moduleA5Share: 0,
        moduleBShare: 0,
        moduleCShare: 0,
      } as never,
    ],
    project: null,
  });
  const bad = checks.find((c) => c.id === "product_co2e_snapshot_valid_x");
  assert.ok(bad);
  assert.equal(bad!.passed, false);
});
